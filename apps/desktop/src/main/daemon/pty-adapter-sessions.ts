import { isShellProcess } from '~shared/agent/detection'

import type { PtyProviderBufferSnapshot } from '../providers/types'
import type { ColdRestoreInfo } from './history-reader'
import { MAX_TOMBSTONES, type ColdRestorePayload } from './pty-adapter-foundation'
import { DaemonPtyAdapterSpawn } from './pty-adapter-spawn'
import type { CreateOrAttachResult, GetSnapshotResult } from './types'

export abstract class DaemonPtyAdapterSessions extends DaemonPtyAdapterSpawn {
  async attach(id: string): Promise<void> {
    await this.ensureConnected()
    if (!this.supportsAuthoritativeBufferSnapshots) {
      this.setPtyBackgrounded(id, false)
    }

    await this.client.request<CreateOrAttachResult>('createOrAttach', {
      sessionId: id,
      cols: 80,
      rows: 24
    })
  }

  hasPty(id: string): boolean {
    return this.activeSessionIds.has(id)
  }

  async probePtyLiveness(id: string): Promise<boolean | null> {
    try {
      const result = await this.client.request<{ size: { cols: number; rows: number } | null }>(
        'getSize',
        { sessionId: id }
      )
      return result.size !== null
    } catch {
      return null
    }
  }

  write(id: string, data: string): void {
    this.markSessionDirty(id)
    this.client.notify('write', { sessionId: id, data })
  }

  resize(id: string, cols: number, rows: number): void {
    this.markSessionDirty(id)
    this.client.notify('resize', { sessionId: id, cols, rows })
  }

  pauseProducer(id: string): void {
    if (!this.supportsProducerFlowControl) {
      return
    }
    this.pausedProducerSessionIds.add(id)
    this.client.notify('pausePty', { sessionId: id })
  }

  resumeProducer(id: string): void {
    this.producerResumesOwedOnReconnect.delete(id)
    if (!this.supportsProducerFlowControl) {
      return
    }
    this.pausedProducerSessionIds.delete(id)
    this.client.notify('resumePty', { sessionId: id })
  }

  // Why fire-and-forget (like pausePty): a delivery hint for the daemon's
  // keep-tail stream thinning.
  setPtyBackgrounded(id: string, background: boolean): void {
    if (!this.supportsProducerFlowControl) {
      return
    }
    // Why: preserved v19 daemons can thin but cannot return the absolute
    // snapshot sequence needed to recover a gap. Clear their stale hint too.
    const safeBackground = this.supportsAuthoritativeBufferSnapshots && background
    if (safeBackground) {
      this.backgroundedSessionIds.add(id)
    } else {
      this.backgroundedSessionIds.delete(id)
    }
    this.client.notify('setSessionBackground', { sessionId: id, background: safeBackground })
  }

  async shutdown(id: string, opts: { immediate?: boolean; keepHistory?: boolean }): Promise<void> {
    // Why: sleep/exact-stop kills the live PTY before the periodic checkpoint may run.
    // Force a final snapshot so wake can restore the pane users left.
    if (opts.keepHistory) {
      if (this.checkpointInFlight) {
        await this.checkpointInFlight
      }
      await this.checkpointSessions([id], { final: true, teardown: true })
      const restoreInfo = this.historyReader?.detectColdRestore(id) ?? null
      const coldRestore = restoreInfo ? this.buildColdRestorePayload(restoreInfo) : null
      if (coldRestore) {
        this.coldRestoreCache.set(id, coldRestore)
        this.sleepRestoreSessionIds.add(id)
        // Why: physical exit must not mark intentional sleep as a clean end;
        // the final checkpoint remains the wake-time recovery authority.
        this.historyManager?.suspendSession(id)
      }
    }
    await this.client.request('kill', { sessionId: id, immediate: opts.immediate ?? false })
    this.activeSessionIds.delete(id)
    this.dirtySessionVersions.delete(id)
    if (!opts.keepHistory) {
      this.coldRestoreCache.delete(id)
      this.sleepRestoreSessionIds.delete(id)
    }
    // Why: the !keepHistory close path doesn't take a final checkpoint, so a
    // session stranded in sessionsNeedingFullCheckpoint would never be cleared.
    // (Under keepHistory the final checkpoint above already cleared the flag, so
    // this is a harmless no-op there — kept unconditional to cover both paths.)
    this.sessionsNeedingFullCheckpoint.delete(id)
    this.lastFullCheckpointAt.delete(id)
    this.stopCheckpointTimerIfIdle()
    this.initialCwds.delete(id)
    // Why: history removal is for the "user explicitly closed this terminal"
    // path. Sleep also calls shutdown but expects scrollback to survive — wake
    // re-spawns and the cold-restore reader needs the dir intact. Caller
    // indicates intent via opts.keepHistory.
    if (this.historyManager && !opts.keepHistory) {
      void this.historyManager
        .removeSession(id)
        .catch((err) => console.warn('[history] removeSession failed:', id, err))
    }

    // Why: tombstone rejects reattach against a session the user explicitly
    // killed. Sleep legitimately reattaches on wake, so skip both the LRU bump
    // and the size-cap eviction under keepHistory.
    if (!opts.keepHistory) {
      this.killedSessionTombstones.delete(id)
      this.killedSessionTombstones.set(id, Date.now())
      if (this.killedSessionTombstones.size > MAX_TOMBSTONES) {
        const oldest = this.killedSessionTombstones.keys().next().value
        if (oldest) {
          this.killedSessionTombstones.delete(oldest)
        }
      }
    }
  }

  ackColdRestore(sessionId: string): void {
    this.coldRestoreCache.delete(sessionId)
    this.sleepRestoreSessionIds.delete(sessionId)
  }

  clearTombstone(sessionId: string): void {
    this.killedSessionTombstones.delete(sessionId)
  }

  protected buildColdRestorePayload(restoreInfo: ColdRestoreInfo): ColdRestorePayload | null {
    // Why prefer scrollbackAnsi for alt-screen: snapshotAnsi is the alt buffer
    // (vim/less/htop); normal sessions use the full snapshot + rehydrate.
    // Why the snapshotAnsi fallback: a hibernated TUI agent (empty scrollback)
    // would otherwise get `|| null` → blank pane on wake. snapshotAnsi *alone*
    // (no rehydrateSequences — they start with \x1b[?1049h, which the
    // renderer's POST_REPLAY_MODE_RESET does NOT undo) lands the last frame as
    // normal scrollback. An empty snapshot still yields null → no-op.
    const scrollback = restoreInfo.modes.alternateScreen
      ? restoreInfo.scrollbackAnsi || restoreInfo.snapshotAnsi || null
      : restoreInfo.rehydrateSequences + restoreInfo.snapshotAnsi
    if (!scrollback) {
      return null
    }
    return { scrollback, cwd: restoreInfo.cwd, oscLinks: restoreInfo.oscLinks }
  }

  async sendSignal(id: string, signal: string): Promise<void> {
    await this.client.request('signal', { sessionId: id, signal })
  }

  async getCwd(id: string): Promise<string> {
    try {
      const result = await this.client.request<{ cwd: string | null }>('getCwd', {
        sessionId: id
      })
      return result.cwd ?? ''
    } catch {
      return ''
    }
  }

  async getInitialCwd(id: string): Promise<string> {
    return this.initialCwds.get(id) ?? ''
  }

  // Why: resize() is a fire-and-forget notify, so a resize can be dropped
  // daemon-side (session not yet alive, exited, invalid dims, cold-restore
  // snapshot-col coercion) without the renderer knowing. This reads the size
  // the daemon actually applied so the renderer can detect that drift on resume
  // and re-assert. Null (RPC failure / unknown session) means "cannot confirm",
  // which the renderer treats as a cue to re-forward once.
  async getAppliedSize(id: string): Promise<{ cols: number; rows: number } | null> {
    try {
      const result = await this.client.request<{ size: { cols: number; rows: number } | null }>(
        'getSize',
        { sessionId: id }
      )
      return result.size ?? null
    } catch {
      return null
    }
  }

  async getBufferSnapshot(
    id: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<PtyProviderBufferSnapshot | null> {
    if (!this.supportsAuthoritativeBufferSnapshots) {
      return null
    }
    try {
      const result = await this.client.request<GetSnapshotResult>('getSnapshot', {
        sessionId: id,
        ...(typeof opts.scrollbackRows === 'number' ? { scrollbackRows: opts.scrollbackRows } : {})
      })
      const snapshot = result.snapshot
      // Why: older v19 daemons have no absolute output sequence. Their snapshot
      // cannot safely reconcile stream bytes still queued on the other socket.
      if (!snapshot || typeof snapshot.outputSequence !== 'number') {
        return null
      }
      return {
        data: snapshot.rehydrateSequences + snapshot.snapshotAnsi,
        scrollbackAnsi: snapshot.scrollbackAnsi,
        cols: snapshot.cols,
        rows: snapshot.rows,
        cwd: snapshot.cwd,
        lastTitle: snapshot.lastTitle,
        seq: snapshot.outputSequence,
        source: 'headless',
        oscLinks: snapshot.oscLinks,
        alternateScreen: snapshot.modes.alternateScreen,
        ...(snapshot.pendingEscapeTailAnsi
          ? { pendingEscapeTailAnsi: snapshot.pendingEscapeTailAnsi }
          : {})
      }
    } catch {
      return null
    }
  }

  async clearBuffer(id: string): Promise<void> {
    await this.client.request('clearScrollback', { sessionId: id })
    this.markSessionDirty(id)
  }

  acknowledgeDataEvent(_id: string, _charCount: number): void {
    // No flow control for daemon-backed terminals
  }

  async hasChildProcesses(id: string): Promise<boolean> {
    const foregroundProcess = await this.getForegroundProcess(id)
    // Why: daemon-backed PTYs can host long-lived agents while the renderer is
    // detached. Cleanup prompts must not treat those sessions like idle shells.
    return foregroundProcess !== null && !isShellProcess(foregroundProcess)
  }

  async getForegroundProcess(id: string): Promise<string | null> {
    try {
      const result = await this.client.request<{ foregroundProcess: string | null }>(
        'getForegroundProcess',
        { sessionId: id }
      )
      return result.foregroundProcess
    } catch {
      return null
    }
  }

  async confirmForegroundProcess(id: string): Promise<string | null> {
    try {
      const result = await this.client.request<{ foregroundProcess: string | null }>(
        'confirmForegroundProcess',
        { sessionId: id }
      )
      return result.foregroundProcess
    } catch {
      return null
    }
  }

  async serialize(ids: string[]): Promise<string> {
    const sessions: Record<string, { initialCwd?: string }> = {}
    for (const id of ids) {
      sessions[id] = { initialCwd: this.initialCwds.get(id) }
    }
    return JSON.stringify(sessions)
  }

  async revive(_state: string): Promise<void> {
    // Sessions already live in the daemon — no revival needed
  }

  /** Called on app launch. Lists daemon sessions, kills orphans whose
   *  workspaceId no longer exists, and caches alive session IDs.
   *
   *  IMPORTANT: a session id embeds the worktree id it was minted under, which is
   *  the worktree's *path* at spawn time. When a worktree folder is renamed, its
   *  id changes but live sessions keep the old id. Callers MUST therefore seed
   *  `validWorktreeIds` with each live worktree's `WorktreeMeta.priorWorktreeIds`
   *  (the pre-rename aliases) or those sessions will be reaped as false orphans.
   *  This reconcile has no production caller yet; wire the alias in when it gains
   *  one. */
}
