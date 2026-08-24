import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import type { PtyBackgroundStreamEvent, PtyProcessInfo } from '../providers/types'
import { DaemonPtyAdapterSessions } from './pty-adapter-sessions'
import { parsePtySessionId } from './pty-session-id'
import type { ListSessionsResult, SessionInfo } from './types'

export abstract class DaemonPtyAdapterEvents extends DaemonPtyAdapterSessions {
  async reconcileOnStartup(validWorktreeIds: Set<string>): Promise<{
    alive: string[]
    killed: string[]
  }> {
    await this.ensureConnected()
    const result = await this.client.request<ListSessionsResult>('listSessions', undefined)

    const alive: string[] = []
    const killed: string[] = []

    for (const session of result.sessions) {
      if (!session.isAlive) {
        continue
      }
      // Why: session IDs use the format `${worktreeId}@@${shortUuid}`. Sessions
      // whose id does not match the minted format (worktreeId === null) cannot
      // be tied to a live worktree and are treated as orphans.
      const { worktreeId } = parsePtySessionId(session.sessionId)

      if (worktreeId === null || !validWorktreeIds.has(worktreeId)) {
        try {
          await this.client.request('kill', { sessionId: session.sessionId })
        } catch {
          /* already dead */
        }
        killed.push(session.sessionId)
      } else {
        alive.push(session.sessionId)
        // Why: background sessions discovered here may produce output before
        // the user reattaches their pane. Without adding them to the checkpoint
        // set, disconnectOnly()'s final checkpoint would skip them, leaving
        // stale recovery data if the daemon later crashes.
        this.activeSessionIds.add(session.sessionId)
        this.historyManager?.registerWriter(session.sessionId)
      }
    }

    return { alive, killed }
  }

  async listProcesses(): Promise<PtyProcessInfo[]> {
    await this.ensureConnected()
    const result = await this.client.request<ListSessionsResult>('listSessions', undefined)
    return result.sessions
      .filter((s) => s.isAlive)
      .map((s) => ({
        id: s.sessionId,
        // Why: OSC 7 may not arrive before destructive cleanup. Spawn cwd is
        // still authoritative ownership until the daemon reports a live cwd.
        cwd: s.cwd ?? this.initialCwds.get(s.sessionId) ?? '',
        title: 'shell',
        ...(s.terminalHandle ? { terminalHandle: s.terminalHandle } : {})
      }))
  }

  // Why: the Manage Sessions panel needs the full SessionInfo (pid, state,
  // createdAt) per session for display; listProcesses drops that detail for
  // the IPtyProvider contract. Keep both in parallel rather than widening
  // the provider surface.
  async listSessions(): Promise<SessionInfo[]> {
    await this.ensureConnected()
    const result = await this.client.request<ListSessionsResult>('listSessions', undefined)
    return result.sessions.filter((s) => s.isAlive)
  }

  getActiveSessionIds(): string[] {
    return [...this.activeSessionIds]
  }

  // Why: used by the "Restart daemon" handler to synthesize pty:exit for every
  // live session *before* tearing down the adapter. The daemon's own
  // kill-all-and-shutdown path explicitly suppresses onExit fanout
  // (session.ts:246-252), so without this the renderer panes would black-hole
  // writes to a disposed adapter forever. Reuses the existing exitListeners
  // path so downstream cleanup (clearProviderPtyState, markClaudePtyExited,
  // renderer pty:exit) runs exactly as it does on natural exit.
  fanoutSyntheticExits(code: number): void {
    const ids = [...this.activeSessionIds]
    this.activeSessionIds.clear()
    this.dirtySessionVersions.clear()
    this.lastFullCheckpointAt.clear()
    this.sessionsNeedingFullCheckpoint.clear()
    this.pausedProducerSessionIds.clear()
    this.producerResumesOwedOnReconnect.clear()
    this.stopCheckpointTimer()
    for (const id of ids) {
      this.coldRestoreCache.delete(id)
      // Why: listener throws are intentionally *not* caught — matches the
      // natural onExit fanout in setupEventRouting, so synthetic exits don't
      // diverge in error semantics from real ones. A throwing listener is a
      // bug that should surface loudly, not be silently swallowed.
      // oxlint-disable-next-line unicorn/no-useless-spread -- copy-safe: listeners may unsubscribe during iteration
      for (const listener of [...this.exitListeners]) {
        listener({ id, code })
      }
    }
  }

  async getDefaultShell(): Promise<string> {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'powershell.exe'
    }
    return process.env.SHELL || '/bin/zsh'
  }

  async getProfiles(): Promise<{ name: string; path: string }[]> {
    if (process.platform === 'win32') {
      return [
        { name: 'PowerShell', path: 'powershell.exe' },
        { name: 'Command Prompt', path: 'cmd.exe' }
      ]
    }
    const shells = ['/bin/zsh', '/bin/bash', '/bin/sh']
    return shells.filter((s) => existsSync(s)).map((s) => ({ name: basename(s), path: s }))
  }

  onData(
    callback: (payload: { id: string; data: string; sequenceChars?: number }) => void
  ): () => void {
    this.dataListeners.push(callback)
    return () => {
      const idx = this.dataListeners.indexOf(callback)
      if (idx !== -1) {
        this.dataListeners.splice(idx, 1)
      }
    }
  }

  onBackgroundStreamEvent(callback: (payload: PtyBackgroundStreamEvent) => void): () => void {
    this.backgroundStreamListeners.push(callback)
    return () => {
      const idx = this.backgroundStreamListeners.indexOf(callback)
      if (idx !== -1) {
        this.backgroundStreamListeners.splice(idx, 1)
      }
    }
  }

  onReplay(_callback: (payload: { id: string; data: string }) => void): () => void {
    return () => {}
  }

  onExit(callback: (payload: { id: string; code: number }) => void): () => void {
    this.exitListeners.push(callback)
    return () => {
      const idx = this.exitListeners.indexOf(callback)
      if (idx !== -1) {
        this.exitListeners.splice(idx, 1)
      }
    }
  }

  dispose(): void {
    this.stopCheckpointTimer()
    this.dirtySessionVersions.clear()
    this.lastFullCheckpointAt.clear()
    this.coldRestoreCache.clear()
    this.pausedProducerSessionIds.clear()
    this.producerResumesOwedOnReconnect.clear()
    this.removeEventListener?.()
    this.removeEventListener = null
    // Why: final checkpoints are written daemon-side in TerminalHost.dispose()
    // which has direct access to sessions. The adapter only marks sessions as
    // cleanly ended here so they don't trigger false cold restores.
    if (this.historyManager) {
      void this.historyManager
        .dispose()
        .catch((err) => console.warn('[history] dispose failed:', err))
    }
    this.client.disconnect()
  }

  // Why: for in-process daemon mode, disconnect without flushing history.
  // dispose() writes endedAt for all sessions, which would prevent cold
  // restore. disconnectOnly() leaves history files in unclean state so
  // the next launch detects them as crash-recoverable.
  // We write a final checkpoint before disconnecting so that if the daemon
  // later crashes while Yiru is closed, checkpoint.json has recovery data.
  async disconnectOnly(): Promise<void> {
    this.stopCheckpointTimer()
    // Why: wait for any in-flight timer pass to finish before starting
    // the final checkpoint. Otherwise both passes race on the shared tmp
    // file, risking ENOENT on rename and disabling future writes.
    if (this.checkpointInFlight) {
      await this.checkpointInFlight
    }
    // Why: without a final checkpoint, sessions opened after the last timer
    // tick have no checkpoint.json on disk. If the detached daemon later
    // dies, detectColdRestore finds nothing to restore from. Must await
    // before disconnecting — fire-and-forget would race with client.disconnect()
    // and the pending getSnapshot RPCs would be rejected.
    await this.checkpointAllSessions()
    this.dirtySessionVersions.clear()
    this.lastFullCheckpointAt.clear()
    this.coldRestoreCache.clear()
    // Why: the detached daemon keeps these PTYs alive for warm reattach; a
    // pause left behind would block their shells for a failsafe window.
    for (const id of this.pausedProducerSessionIds) {
      this.client.notify('resumePty', { sessionId: id })
    }
    this.pausedProducerSessionIds.clear()
    this.producerResumesOwedOnReconnect.clear()
    this.removeEventListener?.()
    this.removeEventListener = null
    this.client.disconnect()
  }
}
