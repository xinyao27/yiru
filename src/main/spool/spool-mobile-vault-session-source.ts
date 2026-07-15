import { createHash } from 'node:crypto'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import { normalizeExecutionHostId } from '../../shared/execution-host'
import type { RuntimeMobileSessionTerminalClientTab } from '../../shared/runtime-types'
import type {
  SpoolExecutionHostSessionReader,
  SpoolHistoricalSessionCandidate,
  SpoolHistoricalSessionPurpose,
  SpoolLiveSessionCandidate,
  SpoolOwnerHistoricalSessionRecord,
  SpoolSessionProvider,
  SpoolSessionSource,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import {
  normalizeOwnerHistoricalSessionRecord,
  type SpoolOwnerSessionRecords
} from './spool-owner-session-records'
import type { SpoolContinuedSessionBindings } from './spool-continued-session-bindings'
import { SpoolSessionReadRoutes, spoolSessionReadRouteBinding } from './spool-session-read-routes'

const MAX_PROVIDER_SESSION_ID_LENGTH = 512
const MAX_TERMINAL_HANDLE_LENGTH = 2048
const LIVE_SESSION_INVENTORY_SCOPE = '00000000-0000-4000-8000-000000000000'

type ReadyMobileSessionTerminalTab = Extract<
  RuntimeMobileSessionTerminalClientTab,
  { status: 'ready' }
>

export class SpoolMobileVaultSessionSource implements SpoolSessionSource {
  private readonly readRoutes: SpoolSessionReadRoutes

  constructor(
    private readonly reader: SpoolExecutionHostSessionReader,
    private readonly ownerRecords: SpoolOwnerSessionRecords,
    private readonly continued: SpoolContinuedSessionBindings,
    private readonly resolveLocalWslDistro?: (
      target: SpoolOwnerWorktree
    ) => string | null | Promise<string | null>
  ) {
    this.readRoutes = new SpoolSessionReadRoutes(
      async (request, cursor) => await this.reader.releaseAiVaultSessionPage(request, cursor)
    )
  }

  async listLiveSessions(
    worktree: SpoolSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<readonly SpoolLiveSessionCandidate[]> {
    const request = toReadRequest(worktree, 'catalog', LIVE_SESSION_INVENTORY_SCOPE, null)
    const snapshot = await this.reader.listMobileSessionTabs(request, signal)
    signal?.throwIfAborted()
    if (!snapshot || snapshot.worktree !== worktree.worktreeId) {
      return []
    }
    const readyTabs = snapshot.tabs.filter(
      (tab): tab is ReadyMobileSessionTerminalTab =>
        tab.type === 'terminal' &&
        tab.status === 'ready' &&
        tab.worktreeInstanceId === worktree.instanceId
    )
    this.continued.reconcile(worktree, new Set(readyTabs.map((tab) => tab.terminal)))
    return readyTabs
      .map((tab) => projectLiveTab(worktree, tab, this.continued.resolve(worktree, tab.terminal)))
      .filter((session): session is SpoolLiveSessionCandidate => session !== null)
  }

  async listHistoricalSessionPage(
    worktree: SpoolSessionWorktreeIdentity,
    purpose: SpoolHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string,
    signal?: AbortSignal
  ) {
    const binding = spoolSessionReadRouteBinding(worktree, purpose, inventoryScope)
    const firstRequest =
      cursor === null
        ? toReadRequest(
            worktree,
            purpose,
            inventoryScope,
            (await this.resolveLocalWslDistro?.(worktree.target)) ?? null
          )
        : undefined
    signal?.throwIfAborted()
    const lease = this.readRoutes.begin(binding, cursor, firstRequest)
    let abandonedCursor: string | null = null
    try {
      const result = await this.reader.listAiVaultSessionPage(lease.request, cursor, signal)
      abandonedCursor = result.nextCursor
      signal?.throwIfAborted()
      const candidates: SpoolHistoricalSessionCandidate[] = []
      for (const session of result.sessions) {
        const candidate = projectHistoricalSession(worktree, session)
        if (candidate) {
          candidates.push(candidate)
        }
      }
      this.readRoutes.commit(lease, result.nextCursor)
      abandonedCursor = null
      return {
        sessions: candidates,
        nextCursor: result.nextCursor,
        scannedAt: result.scannedAt
      }
    } catch (error) {
      const cursorToRelease = abandonedCursor ?? cursor
      this.readRoutes.fail(lease)
      try {
        // Why: null cancels an opening read; continuations still use their frozen route.
        await this.reader.releaseAiVaultSessionPage(lease.request, cursorToRelease)
      } catch {
        // Preserve the page failure; the reader also expires abandoned cursors.
      }
      throw error
    }
  }

  async releaseHistoricalSessionPage(
    worktree: SpoolSessionWorktreeIdentity,
    purpose: SpoolHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string
  ): Promise<void> {
    const request = this.readRoutes.release(
      spoolSessionReadRouteBinding(worktree, purpose, inventoryScope),
      cursor
    )
    if (request) {
      await this.reader.releaseAiVaultSessionPage(request, cursor)
    }
  }

  resolveOwnerHistoricalRecord(ownerRecordKey: string): SpoolOwnerHistoricalSessionRecord | null {
    return this.ownerRecords.resolve(ownerRecordKey)
  }

  retainOwnerHistoricalRecord(record: SpoolOwnerHistoricalSessionRecord): boolean {
    return this.ownerRecords.rememberResolved(record)
  }

  subscribe(listener: () => void): () => void {
    const unsubscribeReader = this.reader.subscribe?.(listener) ?? (() => {})
    const unsubscribeContinued = this.continued.subscribe(listener)
    return () => {
      unsubscribeReader()
      unsubscribeContinued()
    }
  }
}

function projectLiveTab(
  worktree: SpoolSessionWorktreeIdentity,
  tab: ReadyMobileSessionTerminalTab,
  continued: ReturnType<SpoolContinuedSessionBindings['resolve']>
): SpoolLiveSessionCandidate | null {
  if (tab.worktreeInstanceId !== worktree.instanceId) {
    // Why: path-only and legacy PTY bindings cannot attest the current worktree instance.
    return null
  }
  const terminalHandle = normalizeIdentifier(tab.terminal, MAX_TERMINAL_HANDLE_LENGTH)
  if (!terminalHandle) {
    return null
  }
  const provider = continued?.provider ?? liveProvider(tab)
  const providerSessionId =
    continued?.providerSessionId ??
    (provider === 'claude' || provider === 'codex'
      ? normalizeIdentifier(tab.agentStatus?.providerSession?.id, MAX_PROVIDER_SESSION_ID_LENGTH)
      : null)
  return {
    terminalHandle,
    executionHostId: worktree.target.executionHostId,
    actualHostScope: worktree.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    provider,
    providerSessionId,
    title: continued?.title ?? tab.title
  }
}

function historicalRecordKey(
  worktree: SpoolSessionWorktreeIdentity,
  session: AiVaultSession
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        worktree.actualHostScope,
        worktree.instanceId,
        worktree.spoolIncarnationId,
        session.id
      ])
    )
    .digest('base64url')
}

function projectHistoricalSession(
  worktree: SpoolSessionWorktreeIdentity,
  session: AiVaultSession
): SpoolHistoricalSessionCandidate | null {
  if (
    session.subagent !== null ||
    (session.agent !== 'claude' && session.agent !== 'codex') ||
    normalizeExecutionHostId(session.executionHostId) !== worktree.target.executionHostId
  ) {
    return null
  }
  const providerSessionId = normalizeIdentifier(session.sessionId, MAX_PROVIDER_SESSION_ID_LENGTH)
  if (!providerSessionId) {
    return null
  }
  const ownerRecordKey = historicalRecordKey(worktree, session)
  const ownerRecord = normalizeOwnerHistoricalSessionRecord({
    ownerRecordKey,
    executionHostId: worktree.target.executionHostId,
    actualHostScope: worktree.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    provider: session.agent,
    providerSessionId,
    title: session.title,
    transcriptPath: session.filePath,
    resumeCommand: session.resumeCommand
  })
  if (!ownerRecord) {
    return null
  }
  return {
    ownerRecordKey,
    ownerRecord,
    executionHostId: worktree.target.executionHostId,
    actualHostScope: worktree.actualHostScope,
    provider: session.agent,
    providerSessionId,
    title: session.title,
    attestationCwd: normalizeCwd(session.cwd)
  }
}

function liveProvider(tab: RuntimeMobileSessionTerminalClientTab): SpoolSessionProvider {
  const agent = tab.agentStatus?.agentType ?? tab.launchAgent
  if (agent === 'claude') {
    return 'claude'
  }
  if (agent === 'codex') {
    return 'codex'
  }
  return 'other'
}

function toReadRequest(
  worktree: SpoolSessionWorktreeIdentity,
  purpose: SpoolHistoricalSessionPurpose,
  inventoryScope: string,
  localWslDistro: string | null
) {
  return {
    worktreeKind: worktree.target.kind,
    executionHostId: worktree.target.executionHostId,
    worktreeId: worktree.worktreeId,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    worktreePath: worktree.target.worktreePath,
    localWslDistro,
    purpose,
    inventoryScope
  }
}

function normalizeIdentifier(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > maxLength) {
    return null
  }
  for (const character of trimmed) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) {
      return null
    }
  }
  return trimmed
}

function normalizeCwd(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
