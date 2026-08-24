import { recognizeAgentProcessFromCommandLine } from '~shared/agent/process-recognition'
import { shouldUseShellReadyStartupDelivery } from '~shared/codex-startup-delivery'

import type { PtySpawnOptions, PtySpawnResult } from '../providers/types'
import type { ColdRestoreInfo } from './history-reader'
import {
  DaemonPtyAdapterFoundation,
  TerminalKilledError,
  getRecoveredHistorySeed,
  providerSequenceForSpawn
} from './pty-adapter-foundation'
import { CODEX_SHELL_READY_TIMEOUT_MS } from './session'
import { supportsPtyStartupBarrier } from './shell-ready'
import type { CreateOrAttachResult } from './types'

export abstract class DaemonPtyAdapterSpawn extends DaemonPtyAdapterFoundation {
  async spawn(opts: PtySpawnOptions): Promise<PtySpawnResult> {
    return this.withDaemonRetry(() => this.doSpawn(opts))
  }

  protected async doSpawn(opts: PtySpawnOptions): Promise<PtySpawnResult> {
    const hasProvidedSessionId = opts.sessionId !== undefined
    const sessionId = opts.sessionId ?? (await this.mintAvailablePtySessionId(opts.worktreeId))
    try {
      return await this.spawnSession(opts, sessionId)
    } finally {
      if (!hasProvidedSessionId || opts.isNewSession === true) {
        this.freshSessionIdReservations.delete(sessionId)
      }
    }
  }

  protected async spawnSession(opts: PtySpawnOptions, sessionId: string): Promise<PtySpawnResult> {
    if (this.killedSessionTombstones.has(sessionId)) {
      throw new TerminalKilledError(sessionId)
    }

    if (opts.isNewSession) {
      await this.replaceUnhealthyMacResolverDaemonBeforeNewPty()
    }

    await this.ensureConnected()
    // Why before createOrAttach: a preserved v19 daemon may remember this
    // session as backgrounded. Ordered control delivery clears it before any
    // newly attached stream bytes can be thinned without a recoverable seq.
    if (!this.supportsAuthoritativeBufferSnapshots) {
      this.setPtyBackgrounded(sessionId, false)
    }

    // Why: detect crash-recovery history before spawning a replacement PTY so
    // the revived shell inherits the recovered cwd and dimensions instead of
    // whatever the current renderer happened to request on mount.
    // Why probe aliveness first: detectColdRestore synchronously replays the
    // full checkpoint + log (up to ~5MB) through a scratch emulator on the
    // main process, but a live daemon session ignores spawn params and its
    // own snapshot supersedes disk — the replay result would be discarded.
    // getSize is a read-only probe; on error/unsupported it degrades to the
    // full detect.
    let restoreInfo: ColdRestoreInfo | null = null
    let restoreSkippedForLiveSession = false
    if (this.historyReader?.hasRestorableHistory(sessionId)) {
      if ((await this.getAppliedSize(sessionId)) !== null) {
        restoreSkippedForLiveSession = true
      } else {
        restoreInfo = this.historyReader.detectColdRestore(sessionId)
      }
    }
    let effectiveCwd = restoreInfo?.cwd ?? opts.cwd
    let effectiveCols = restoreInfo?.cols ?? opts.cols
    let effectiveRows = restoreInfo?.rows ?? opts.rows

    const shellReadySupported = opts.command ? supportsPtyStartupBarrier(opts.env ?? {}) : false
    const isCodexStartupCommand =
      recognizeAgentProcessFromCommandLine(opts.command)?.agent === 'codex'
    const shouldWaitForShellReady =
      isCodexStartupCommand &&
      shouldUseShellReadyStartupDelivery({
        command: opts.command,
        startupCommandDelivery: opts.startupCommandDelivery
      })
    const shellReadyTimeoutMs =
      shellReadySupported && isCodexStartupCommand && !shouldWaitForShellReady
        ? CODEX_SHELL_READY_TIMEOUT_MS
        : undefined

    const createOrAttach = (historySeed: string | null) =>
      this.client.request<CreateOrAttachResult>('createOrAttach', {
        sessionId,
        cols: effectiveCols,
        rows: effectiveRows,
        cwd: effectiveCwd,
        env: opts.env,
        envToDelete: opts.envToDelete,
        command: opts.command,
        startupCommandDelivery: opts.startupCommandDelivery,
        launchAgent: opts.launchAgent,
        // Why: without this, the daemon always spawns cmd.exe (COMSPEC) or
        // PowerShell as a fallback — regardless of which shell the renderer
        // asked for in the "+" menu or persisted as the default. Forwarding
        // the override makes the daemon path behave the same as the in-process
        // LocalPtyProvider.
        shellOverride: opts.shellOverride,
        terminalWindowsWslDistro: opts.terminalWindowsWslDistro,
        terminalWindowsPowerShellImplementation: opts.terminalWindowsPowerShellImplementation,
        shellReadySupported,
        ...(shellReadyTimeoutMs !== undefined ? { shellReadyTimeoutMs } : {}),
        ...(historySeed ? { historySeed } : {})
      })

    let scrollback = restoreInfo ? getRecoveredHistorySeed(restoreInfo) : null
    let result = await createOrAttach(scrollback)
    const launchIdentity = (): { launchAgent?: NonNullable<typeof result.launchAgent> } =>
      result.launchAgent ? { launchAgent: result.launchAgent } : {}

    if (effectiveCwd) {
      this.initialCwds.set(sessionId, effectiveCwd)
    }

    // Why: the daemon RPC returns the shell pid of the backing subprocess.
    // Surfacing it through PtySpawnResult lets ipc/pty register with the
    // memory collector without a provider-specific accessor.
    let pid = typeof result.pid === 'number' && result.pid > 0 ? result.pid : null

    // Why: check sticky cache first — StrictMode double-mounts call spawn
    // twice. The second call finds an existing daemon session (isNew=false)
    // but should still return the cached cold restore data.
    const cachedRestore = this.coldRestoreCache.get(sessionId)
    if (cachedRestore) {
      // Why: wake after sleep also lands here, and the slept session's active
      // tracking and history writer were dropped when sleep killed the PTY.
      // Without re-registering both, checkpoints stop after wake and the
      // second sleep/wake cycle restores a blank terminal.
      this.activeSessionIds.add(sessionId)
      if (this.historyManager) {
        this.historyManager.reopenSession(sessionId)
      }
      return {
        id: sessionId,
        pid,
        ...launchIdentity(),
        coldRestore: cachedRestore,
        ...(!result.isNew ? { isReattach: true } : {})
      }
    }

    // Why: the probe→createOrAttach gap is racy — the session can exit (or
    // enter termination) in between, so the daemon spawned a fresh shell.
    // Detect now so scrollback restore matches the unprobed path; only the
    // new shell's cwd/dims came from the renderer request in this rare case.
    // Why ignoreCleanEnd: the raced session's exit event (stream socket) can
    // beat the createOrAttach reply and write endedAt via closeSession; that
    // must not null the restore here, or the openSession branch below would
    // delete the checkpoint instead of restoring it.
    if (result.isNew && restoreSkippedForLiveSession) {
      restoreInfo =
        this.historyReader?.detectColdRestore(sessionId, { ignoreCleanEnd: true }) ?? null
      scrollback = restoreInfo ? getRecoveredHistorySeed(restoreInfo) : null
      if (restoreInfo && scrollback) {
        // Why: the aliveness probe raced with session death, so the first
        // create lacked recovery bytes. Replace it before exposing the PTY.
        await this.client.request('kill', { sessionId, immediate: true })
        effectiveCwd = restoreInfo.cwd
        effectiveCols = restoreInfo.cols
        effectiveRows = restoreInfo.rows
        result = await createOrAttach(scrollback)
        pid = typeof result.pid === 'number' && result.pid > 0 ? result.pid : null
        this.initialCwds.set(sessionId, effectiveCwd)
      }
    } else if (!result.isNew && result.historySeeded === false) {
      restoreInfo = this.historyReader?.detectColdRestore(sessionId) ?? null
      scrollback = restoreInfo ? getRecoveredHistorySeed(restoreInfo) : null
    }

    const wasAlreadyManaged = this.activeSessionIds.has(sessionId)
    this.activeSessionIds.add(sessionId)
    const providerSequence = providerSequenceForSpawn(result)

    // Cold restore: daemon created a new session but disk history shows
    // an unclean shutdown → return saved scrollback so the renderer can
    // display the previous terminal content.
    if (restoreInfo && (result.isNew || result.historySeeded === false)) {
      const coldRestore = this.buildColdRestorePayload(restoreInfo)
      const canReanchorHistory = !scrollback || result.historySeeded === true
      // Why: use registerWriter (not openSession) to avoid deleting the
      // existing checkpoint.json. If the revived daemon crashes again before
      // the next 5s tick, the checkpoint is the only recovery data available.
      if (this.historyManager) {
        if (canReanchorHistory) {
          this.historyManager.registerWriter(sessionId)
          this.sessionsNeedingFullCheckpoint.add(sessionId)
          // Why: the revived generation has no valid checkpoint of its own; a
          // cooldown inherited from the pre-crash generation (daemon respawn
          // within one adapter) must not defer this re-anchor.
          this.lastFullCheckpointAt.delete(sessionId)
        } else {
          // Preserve the old recovery files when the new daemon cannot include
          // them; a fresh-only checkpoint would make the data loss permanent.
          this.historyManager.suspendSession(sessionId)
        }
      }
      if (coldRestore) {
        this.coldRestoreCache.set(sessionId, coldRestore)
        return {
          id: sessionId,
          pid,
          ...launchIdentity(),
          coldRestore,
          ...(providerSequence ? { providerSequence } : {}),
          ...(!result.isNew ? { isReattach: true } : {})
        }
      }
      return {
        id: sessionId,
        pid,
        ...launchIdentity(),
        ...(providerSequence ? { providerSequence } : {})
      }
    }

    if (this.historyManager && result.isNew) {
      void this.historyManager
        .openSession(sessionId, {
          cwd: effectiveCwd ?? '',
          cols: effectiveCols,
          rows: effectiveRows
        })
        .catch((err) => console.warn('[history] openSession failed:', sessionId, err))
    } else if (this.historyManager && result.historySeeded === false) {
      // Why: the daemon keeps this failure bit with the live session, so a new
      // adapter cannot promote its fresh-only snapshot after an app restart.
      this.historyManager.suspendSession(sessionId)
    } else if (this.historyManager) {
      // Why: on warm reattach after app relaunch, the HistoryManager is a
      // fresh instance with no writers. registerWriter adds the writer
      // without overwriting meta.json or deleting the existing checkpoint
      // (which is the only valid recovery data until the next tick).
      this.historyManager.registerWriter(sessionId)
      if (!wasAlreadyManaged) {
        // Why: a previous adapter may have drained daemon records it never
        // persisted (a deferred hot-session tick) before the app died.
        // Appending increments past that unknown drain point would put a seq
        // gap in the log, which the restore reader rejects wholesale. Force a
        // full snapshot to re-anchor before any further appends.
        this.sessionsNeedingFullCheckpoint.add(sessionId)
        this.lastFullCheckpointAt.delete(sessionId)
      }
    }

    const isReattach = !result.isNew
    if (!isReattach || !result.snapshot) {
      return {
        id: sessionId,
        pid,
        ...launchIdentity(),
        ...(providerSequence ? { providerSequence } : {}),
        ...(isReattach ? { isReattach: true } : {})
      }
    }

    const isAltScreen = result.snapshot.modes.alternateScreen
    const snapshotPayload =
      result.snapshot.scrollbackAnsi +
      result.snapshot.rehydrateSequences +
      result.snapshot.snapshotAnsi
    // Why kitty flags ride beside the payload, not inside it: the snapshot
    // string reaches renderer xterms too, where POST_REPLAY_REATTACH_RESET's
    // deliberate kitty reset must win. Only the runtime emulator re-seed
    // consumes the flags (terminal-query-authority.md §kitty).
    const kittyKeyboardFlags = result.snapshot.modes.kittyKeyboardFlags
    return {
      id: sessionId,
      pid,
      ...launchIdentity(),
      snapshot: snapshotPayload,
      snapshotCols: result.snapshot.cols,
      snapshotRows: result.snapshot.rows,
      ...(providerSequence ? { providerSequence } : {}),
      ...(typeof kittyKeyboardFlags === 'number' && kittyKeyboardFlags > 0
        ? { snapshotKittyKeyboardFlags: kittyKeyboardFlags }
        : {}),
      isReattach: true,
      isAlternateScreen: isAltScreen,
      // Why: carry the mid-escape tail so the renderer can write it after the
      // reattach reset — without it the local daemon reattach path renders a
      // split escape's continuation literally, unlike the remote path (#7329).
      ...(result.snapshot.pendingEscapeTailAnsi
        ? { pendingEscapeTailAnsi: result.snapshot.pendingEscapeTailAnsi }
        : {})
    }
  }
}
