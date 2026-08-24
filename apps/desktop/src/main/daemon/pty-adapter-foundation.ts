import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'
import type { AgentHookRelayEnvelope } from '~shared/agent/hook-relay'

import type { PtyBackgroundStreamEvent, PtySpawnResult } from '../providers/types'
import { DaemonClient } from './client'
import { HistoryManager } from './history-manager'
import { getHistorySessionDirName } from './history-paths'
import { HistoryReader, type ColdRestoreInfo } from './history-reader'
import { mintPtySessionId } from './pty-session-id'
import {
  GIT_CREDENTIAL_GUARD_HOST_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type CreateOrAttachResult,
  type ListSessionsResult
} from './types'

export type ColdRestorePayload = {
  scrollback: string
  cwd: string
  oscLinks?: TerminalOscLinkRange[]
}

export function getRecoveredHistorySeed(restoreInfo: ColdRestoreInfo): string | null {
  // Why: alt-screen snapshots represent the TUI buffer; prefer its normal
  // scrollback so a dead TUI is not revived as the fresh shell's active screen.
  return restoreInfo.modes.alternateScreen
    ? restoreInfo.scrollbackAnsi || restoreInfo.snapshotAnsi || null
    : restoreInfo.rehydrateSequences + restoreInfo.snapshotAnsi
}

export function providerSequenceForSpawn(
  result: CreateOrAttachResult
): PtySpawnResult['providerSequence'] {
  if (result.isNew) {
    return { value: 0, generation: 'reset' }
  }
  return typeof result.snapshot?.outputSequence === 'number'
    ? { value: result.snapshot.outputSequence, generation: 'continued' }
    : undefined
}

export type DaemonPtyAdapterOptions = {
  socketPath: string
  tokenPath: string
  protocolVersion?: number
  /** Directory for disk-based terminal history. When set, the adapter writes
   *  raw PTY output to disk for cold restore on daemon crash. */
  historyPath?: string
  /** Called when the daemon socket is unreachable (process died). Expected to
   *  fork a fresh daemon so the next connection attempt can succeed. */
  respawn?: () => Promise<void>
  onAgentHook?: (envelope: AgentHookRelayEnvelope) => void
}

export const MAX_TOMBSTONES = 1000
export const MAX_CONCURRENT_CHECKPOINTS = 4
export const CHECKPOINT_INTERVAL_MS = 5_000
export const FULL_CHECKPOINT_COOLDOWN_MS = 45_000

export class TerminalKilledError extends Error {
  constructor(sessionId: string) {
    super(`Session "${sessionId}" was explicitly killed`)
    this.name = 'TerminalKilledError'
  }
}

export abstract class DaemonPtyAdapterFoundation {
  readonly protocolVersion: number
  protected socketPath: string
  protected tokenPath: string
  protected client: DaemonClient
  protected historyManager: HistoryManager | null
  protected historyReader: HistoryReader | null
  protected historyPath: string | null
  protected respawnFn: (() => Promise<void>) | null
  protected onAgentHook: ((envelope: AgentHookRelayEnvelope) => void) | null
  // Why: multiple pane mounts can call spawn() concurrently. If the daemon is
  // dead, all calls enter withDaemonRetry's catch block at once. Without a
  // lock, each would fork its own daemon process. This promise coalesces
  // concurrent respawns so only the first caller forks; the rest await it.
  protected respawnPromise: Promise<void> | null = null
  protected dataListeners: ((payload: {
    id: string
    data: string
    sequenceChars?: number
  }) => void)[] = []
  protected exitListeners: ((payload: { id: string; code: number }) => void)[] = []
  protected backgroundStreamListeners: ((payload: PtyBackgroundStreamEvent) => void)[] = []
  protected removeEventListener: (() => void) | null = null
  protected initialCwds = new Map<string, string>()
  // Why: React re-renders and StrictMode double-mounts can call createOrAttach
  // for a session the user just killed. Without tombstones, the daemon would
  // create a fresh session — resurrecting a terminal the user explicitly closed.
  // Uses a Map<id, timestamp> so eviction removes the oldest by insertion order,
  // matching terminal-host.ts tombstone semantics.
  protected killedSessionTombstones = new Map<string, number>()
  // Why: React StrictMode double-mounts: mount → cold restore → unmount →
  // mount → ??? The sticky cache returns the same cold restore data on the
  // second mount until the renderer explicitly acknowledges it.
  protected coldRestoreCache = new Map<string, ColdRestorePayload>()
  protected sleepRestoreSessionIds = new Set<string>()
  protected activeSessionIds = new Set<string>()
  protected freshSessionIdReservations = new Set<string>()
  protected dirtySessionVersions = new Map<string, number>()
  // Why: a cold-restored session is a fresh shell whose on-disk checkpoint and
  // log belong to the pre-crash session. Incremental appends would land on
  // that stale log (and be rejected by its sequence check on restore), so the
  // first tick must re-anchor with a full snapshot checkpoint, which resets
  // the log to a new generation.
  protected sessionsNeedingFullCheckpoint = new Set<string>()
  protected checkpointTimer: ReturnType<typeof setTimeout> | null = null
  protected checkpointInFlight: Promise<void> | null = null
  // Why: checkpoint-based persistence requires the getSnapshot RPC (v4+).
  // Legacy daemons reject it, causing noisy log spam every 5 seconds.
  protected supportsCheckpoints: boolean
  // Why: incremental checkpoints require the takePendingOutput RPC (v13+).
  // Against older daemons the tick falls back to full-snapshot checkpoints.
  protected supportsIncrementalCheckpoints: boolean
  // Why: producer pause/resume notifications require v19+; legacy daemons
  // must never see them, so gating makes them silent no-ops there.
  protected supportsProducerFlowControl: boolean
  protected supportsAuthoritativeBufferSnapshots: boolean
  protected pausedProducerSessionIds = new Set<string>()
  // Why tracked here: the daemon's background set (keep-tail stream thinning
  // + transient-fact scan authority) dies with the daemon process/socket;
  // re-sync it on a fresh connection so hidden panes stay thinned.
  protected backgroundedSessionIds = new Set<string>()
  // Why: a daemon that survives a socket drop can still hold a pause whose
  // resume died with the connection. Owe those sessions a resume on the next
  // connect; the daemon's 5s failsafe covers the window in between.
  protected producerResumesOwedOnReconnect = new Set<string>()
  // Why: a streaming session (build logs, `yes`) re-triggers a full multi-MB
  // snapshot checkpoint on every 5s tick via pending-buffer overflow or the
  // log-size cap — hundreds of MB/min of disk writes from one busy terminal.
  // Bounding cap/overflow-triggered snapshots per session trades bounded
  // cold-crash scrollback staleness (warm reattach and final checkpoints are
  // unaffected and bypass this) for a ~9x cut in worst-case write volume.
  protected lastFullCheckpointAt = new Map<string, number>()

  supportsGitCredentialGuardHost(): boolean {
    return this.protocolVersion >= GIT_CREDENTIAL_GUARD_HOST_PROTOCOL_VERSION
  }

  canProvideAuthoritativeBufferSnapshot(_id: string): boolean {
    return this.supportsAuthoritativeBufferSnapshots
  }

  constructor(opts: DaemonPtyAdapterOptions) {
    this.protocolVersion = opts.protocolVersion ?? PROTOCOL_VERSION
    this.socketPath = opts.socketPath
    this.tokenPath = opts.tokenPath
    this.client = new DaemonClient({
      socketPath: opts.socketPath,
      tokenPath: opts.tokenPath,
      protocolVersion: opts.protocolVersion
    })
    this.historyManager = opts.historyPath ? new HistoryManager(opts.historyPath) : null
    this.historyReader = opts.historyPath ? new HistoryReader(opts.historyPath) : null
    this.historyPath = opts.historyPath ?? null
    this.respawnFn = opts.respawn ?? null
    this.onAgentHook = opts.onAgentHook ?? null
    this.supportsCheckpoints = this.protocolVersion >= 4
    this.supportsIncrementalCheckpoints = this.protocolVersion >= 13
    this.supportsProducerFlowControl = this.protocolVersion >= 19
    this.supportsAuthoritativeBufferSnapshots = this.protocolVersion >= 20
    this.client.onDisconnected(() => {
      for (const id of this.pausedProducerSessionIds) {
        this.producerResumesOwedOnReconnect.add(id)
      }
      this.pausedProducerSessionIds.clear()
    })
  }

  getHistoryManager(): HistoryManager | null {
    return this.historyManager
  }

  async mintAvailablePtySessionId(worktreeId?: string): Promise<string> {
    await this.ensureConnected()
    const result = await this.client.request<ListSessionsResult>('listSessions', undefined)
    const liveSessionIds = new Set(
      result.sessions.filter((session) => session.isAlive).map((session) => session.sessionId)
    )
    while (true) {
      const sessionId = mintPtySessionId(worktreeId)
      if (
        liveSessionIds.has(sessionId) ||
        this.freshSessionIdReservations.has(sessionId) ||
        (this.historyPath !== null &&
          existsSync(join(this.historyPath, getHistorySessionDirName(sessionId))))
      ) {
        continue
      }
      this.freshSessionIdReservations.add(sessionId)
      return sessionId
    }
  }

  async initializeAgentHookHost(config?: {
    endpointDir: string
    env: string
  }): Promise<Record<string, string>> {
    await this.ensureConnected()
    const result = await this.client.request<{ env: Record<string, string> }>(
      'configureAgentHookHost',
      { config: config ?? null }
    )
    return result.env
  }

  protected abstract ensureConnected(): Promise<void>
  protected abstract withDaemonRetry<T>(operation: () => Promise<T>): Promise<T>
  protected abstract replaceUnhealthyMacResolverDaemonBeforeNewPty(): Promise<void>
  protected abstract buildColdRestorePayload(
    restoreInfo: ColdRestoreInfo
  ): ColdRestorePayload | null
  abstract setPtyBackgrounded(id: string, background: boolean): void
  abstract fanoutSyntheticExits(code: number): void
  protected abstract stopCheckpointTimer(): void
  protected abstract stopCheckpointTimerIfIdle(): void
  protected abstract scheduleCheckpointTimer(): void
  protected abstract checkpointAllSessions(): Promise<void>
  protected abstract checkpointSessions(
    sessionIds: Iterable<string>,
    options?: { final?: boolean; teardown?: boolean }
  ): Promise<Set<string>>
  abstract getAppliedSize(id: string): Promise<{ cols: number; rows: number } | null>
  protected abstract setupEventRouting(): void
  protected abstract flushOwedProducerResumes(): void
  protected abstract resyncBackgroundedSessions(): void
  protected abstract markSessionDirty(sessionId: string): void
  protected abstract emitBackgroundStreamEvent(payload: PtyBackgroundStreamEvent): void
}
