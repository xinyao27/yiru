import type { IPtyProvider, PtyBackgroundStreamEvent } from '../providers/types'
import { getMacDaemonSystemResolverHealth } from './health'
import { DaemonPtyAdapterCheckpoints } from './pty-adapter-checkpoints'
import type { DaemonEvent, ListSessionsResult } from './types'

export class DaemonPtyAdapter extends DaemonPtyAdapterCheckpoints implements IPtyProvider {
  // Why: when the daemon process dies, operations fail with ENOENT (socket
  // gone), ECONNREFUSED, or "Connection lost" (socket closed mid-request).
  // Rather than leaving all terminals permanently broken until app restart,
  // this wrapper detects daemon-death errors, tears down the stale client
  // state, forks a fresh daemon via respawnFn, reconnects, and retries the
  // operation once. If respawn itself fails, the error propagates normally.
  protected async withDaemonRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (!this.respawnFn || !isDaemonGoneError(err)) {
        throw err
      }
      if (!this.respawnPromise) {
        this.respawnPromise = this.doRespawn().finally(() => {
          this.respawnPromise = null
        })
      }
      await this.respawnPromise
      return await fn()
    }
  }

  protected async replaceUnhealthyMacResolverDaemonBeforeNewPty(): Promise<void> {
    if (!this.respawnFn) {
      return
    }

    const health = await getMacDaemonSystemResolverHealth(
      this.socketPath,
      this.tokenPath,
      this.protocolVersion
    )
    if (health !== 'unhealthy') {
      return
    }

    const daemonLiveSessionCount = await this.getDaemonLiveSessionCount()
    const liveSessionCount = Math.max(this.activeSessionIds.size, daemonLiveSessionCount ?? 0)
    if (daemonLiveSessionCount === null || liveSessionCount > 0) {
      console.warn(
        daemonLiveSessionCount === null
          ? '[daemon] macOS system resolver unavailable - preserving daemon because live session state could not be verified'
          : `[daemon] macOS system resolver unavailable - preserving daemon because it owns ${liveSessionCount} live session${liveSessionCount === 1 ? '' : 's'}`
      )
      return
    }

    // Why: replacing the daemon kills its sessions without daemon-side exit
    // fanout. Emit exits first so renderer panes do not write to dead PTYs.
    this.fanoutSyntheticExits(-1)
    if (!this.respawnPromise) {
      this.respawnPromise = this.doRespawn(
        '[daemon] macOS system resolver unavailable - respawning daemon'
      ).finally(() => {
        this.respawnPromise = null
      })
    }
    await this.respawnPromise
  }

  protected async getDaemonLiveSessionCount(): Promise<number | null> {
    try {
      await this.client.ensureConnected()
      const result = await this.client.request<ListSessionsResult>('listSessions', undefined)
      return result.sessions.filter((session) => session.isAlive).length
    } catch {
      return null
    }
  }

  protected emitBackgroundStreamEvent(payload: PtyBackgroundStreamEvent): void {
    // oxlint-disable-next-line unicorn/no-useless-spread -- copy-safe: listeners may unsubscribe during iteration
    for (const listener of [...this.backgroundStreamListeners]) {
      listener(payload)
    }
  }

  protected async doRespawn(message = '[daemon] Daemon died — respawning'): Promise<void> {
    console.warn(message)
    this.removeEventListener?.()
    this.removeEventListener = null
    this.client.disconnect()
    await this.respawnFn!()
  }

  protected setupEventRouting(): void {
    if (this.removeEventListener) {
      return
    }

    this.removeEventListener = this.client.onEvent((raw) => {
      const event = raw as DaemonEvent
      if (event.type !== 'event') {
        return
      }

      if (event.event === 'agentHook') {
        this.onAgentHook?.(event.payload)
      } else if (event.event === 'data') {
        this.markSessionDirty(event.sessionId)
        // oxlint-disable-next-line unicorn/no-useless-spread -- copy-safe: listeners may unsubscribe during iteration
        for (const listener of [...this.dataListeners]) {
          listener({
            id: event.sessionId,
            data: event.payload.data,
            ...(event.payload.sequenceChars === undefined
              ? {}
              : { sequenceChars: event.payload.sequenceChars })
          })
        }
      } else if (event.event === 'sessionBackgroundMarker') {
        this.emitBackgroundStreamEvent({
          id: event.sessionId,
          kind: 'backgroundMarker',
          background: event.payload.background,
          ...(event.payload.scanSeedAnsi !== undefined
            ? { scanSeedAnsi: event.payload.scanSeedAnsi }
            : {})
        })
      } else if (event.event === 'dataGap') {
        this.emitBackgroundStreamEvent({
          id: event.sessionId,
          kind: 'dataGap',
          droppedChars: event.payload.droppedChars,
          ...(event.payload.sequenceChars === undefined
            ? {}
            : { sequenceChars: event.payload.sequenceChars })
        })
      } else if (event.event === 'transientFact') {
        this.emitBackgroundStreamEvent({
          id: event.sessionId,
          kind: 'transientFact',
          fact: event.payload
        })
      } else if (event.event === 'exit') {
        this.activeSessionIds.delete(event.sessionId)
        this.dirtySessionVersions.delete(event.sessionId)
        // Why: an exited session must not be owed a resume on reconnect — a
        // reused sessionId would receive a stray resumePty. Same for the
        // background set: a reused id must start un-thinned.
        this.pausedProducerSessionIds.delete(event.sessionId)
        this.producerResumesOwedOnReconnect.delete(event.sessionId)
        this.backgroundedSessionIds.delete(event.sessionId)
        if (!this.sleepRestoreSessionIds.has(event.sessionId)) {
          this.coldRestoreCache.delete(event.sessionId)
        }
        // Why: an exited session can never be checkpointed again, so its pending
        // full-checkpoint flag is dead state. Without this, a cold-restored
        // session that exits before its first checkpoint leaks a permanent entry.
        this.sessionsNeedingFullCheckpoint.delete(event.sessionId)
        // Why: a reused sessionId (renderer respawns a persisted ptyId) must
        // not inherit the dead session's snapshot cooldown.
        this.lastFullCheckpointAt.delete(event.sessionId)
        this.stopCheckpointTimerIfIdle()
        if (this.historyManager) {
          void this.historyManager
            .closeSession(event.sessionId, event.payload.code)
            .catch((err) => console.warn('[history] closeSession failed:', event.sessionId, err))
        }
        this.initialCwds.delete(event.sessionId)
        // oxlint-disable-next-line unicorn/no-useless-spread -- copy-safe: listeners may unsubscribe during iteration
        for (const listener of [...this.exitListeners]) {
          listener({ id: event.sessionId, code: event.payload.code })
        }
      }
    })
  }
}

// Why: ENOENT/ECONNREFUSED with syscall 'connect' mean the socket is
// unreachable (daemon died). Checking syscall avoids false positives from
// token-file ENOENT (readFileSync), which has no syscall or syscall='open'.
// "Connection lost" / "Not connected" mean the daemon died while we had an
// active or stale connection. "Hello response timed out" means we reconnected
// to a daemon whose socket accepts connections but whose event loop never
// answers the handshake (a wedged daemon, #8689) — respawning re-enters the
// grace-bounded launcher, which drains a transient wedge or replaces a
// permanent one instead of failing every terminal forever. All indicate the
// daemon is unusable and a respawn should be attempted.
function isDaemonGoneError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false
  }
  const errno = err as NodeJS.ErrnoException
  if ((errno.code === 'ENOENT' || errno.code === 'ECONNREFUSED') && errno.syscall === 'connect') {
    return true
  }
  const msg = err.message
  return msg === 'Connection lost' || msg === 'Not connected' || msg === 'Hello response timed out'
}
