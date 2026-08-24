import { DaemonPtyAdapterEvents } from './pty-adapter-events'
import {
  CHECKPOINT_INTERVAL_MS,
  FULL_CHECKPOINT_COOLDOWN_MS,
  MAX_CONCURRENT_CHECKPOINTS
} from './pty-adapter-foundation'
import type { GetSnapshotResult, TakePendingOutputResult } from './types'

export abstract class DaemonPtyAdapterCheckpoints extends DaemonPtyAdapterEvents {
  protected async ensureConnected(): Promise<void> {
    await this.client.ensureConnected()
    // Why sampled before setupEventRouting: routing is (re)installed exactly
    // once per connection, so "no listener yet" identifies a fresh connect —
    // the only time the daemon-side backgrounded set needs a resync (it is
    // process state that died with the previous daemon/socket).
    const isFreshConnection = this.removeEventListener === null
    this.setupEventRouting()
    this.scheduleCheckpointTimer()
    this.flushOwedProducerResumes()
    if (isFreshConnection) {
      this.resyncBackgroundedSessions()
    }
  }

  protected resyncBackgroundedSessions(): void {
    for (const id of this.backgroundedSessionIds) {
      // Harmless no-op for sessions the daemon doesn't know (yet).
      this.client.notify('setSessionBackground', { sessionId: id, background: true })
    }
  }

  protected flushOwedProducerResumes(): void {
    if (this.producerResumesOwedOnReconnect.size === 0) {
      return
    }
    for (const id of this.producerResumesOwedOnReconnect) {
      // Why: resuming a session the fresh daemon doesn't know is a harmless
      // no-op; leaving a survivor paused would waste 5s of failsafe latency.
      this.client.notify('resumePty', { sessionId: id })
    }
    this.producerResumesOwedOnReconnect.clear()
  }

  protected stopCheckpointTimer(): void {
    if (!this.checkpointTimer) {
      return
    }
    clearTimeout(this.checkpointTimer)
    this.checkpointTimer = null
  }

  protected stopCheckpointTimerIfIdle(): void {
    if (this.dirtySessionVersions.size === 0) {
      this.stopCheckpointTimer()
    }
  }

  protected scheduleCheckpointTimer(): void {
    if (
      this.checkpointTimer ||
      !this.historyManager ||
      !this.supportsCheckpoints ||
      this.dirtySessionVersions.size === 0
    ) {
      return
    }
    // Why: checkpointing is only needed after terminal data/resize/write marks
    // a session dirty. A permanent interval woke the main process every 5s for
    // idle daemon-backed terminals just to discover there was nothing to write.
    this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = null
      // Why: if the previous pass is still in-flight (slow RPC or disk),
      // retry later instead of overlapping checkpoint() writes to the same tmp
      // file, which can lose a rename and disable future history writes.
      if (this.checkpointInFlight) {
        this.scheduleCheckpointTimer()
        return
      }
      this.checkpointInFlight = this.checkpointDirtySessions().finally(() => {
        this.checkpointInFlight = null
        this.scheduleCheckpointTimer()
      })
    }, CHECKPOINT_INTERVAL_MS)
  }

  protected markSessionDirty(sessionId: string): void {
    if (!this.activeSessionIds.has(sessionId)) {
      return
    }
    this.dirtySessionVersions.set(sessionId, (this.dirtySessionVersions.get(sessionId) ?? 0) + 1)
    this.scheduleCheckpointTimer()
  }

  protected async checkpointDirtySessions(): Promise<void> {
    if (!this.historyManager || this.dirtySessionVersions.size === 0) {
      return
    }
    // Why: getSnapshot serializes the daemon's terminal buffer. On large
    // workspaces, checkpointing every live idle session every 5s burns CPU and
    // disk for identical payloads; dirty versions keep retries precise without
    // dropping writes that arrive during an in-flight checkpoint.
    const versions = new Map(
      [...this.dirtySessionVersions].filter(([sessionId]) => this.activeSessionIds.has(sessionId))
    )
    if (versions.size === 0) {
      this.dirtySessionVersions.clear()
      this.stopCheckpointTimer()
      return
    }
    const completed = await this.checkpointSessions(versions.keys())
    for (const [sessionId, version] of versions) {
      if (completed.has(sessionId) && this.dirtySessionVersions.get(sessionId) === version) {
        this.dirtySessionVersions.delete(sessionId)
      }
    }
    this.stopCheckpointTimerIfIdle()
  }

  // Why: the adapter runs in the Electron main process and does not have direct
  // access to daemon Session objects. It calls checkpoint RPCs over the daemon
  // socket per session. Returns a promise that resolves when all checkpoint
  // writes complete (callers that don't need to wait can void it).
  // Why final=true here: this runs on clean disconnect, where the full-depth
  // snapshot (not the increment log) must be the restore source. It is not a
  // teardown snapshot: the detached daemon and its PTYs keep running for warm
  // reattach, so shell-ready scanner state must remain intact.
  protected async checkpointAllSessions(): Promise<void> {
    const completed = await this.checkpointSessions(this.activeSessionIds, { final: true })
    for (const sessionId of completed) {
      this.dirtySessionVersions.delete(sessionId)
    }
  }

  protected async checkpointSessions(
    sessionIds: Iterable<string>,
    opts?: { final?: boolean; teardown?: boolean }
  ): Promise<Set<string>> {
    const completed = new Set<string>()
    if (!this.historyManager) {
      return completed
    }
    const ids = Array.from(sessionIds)
    let nextIndex = 0

    const checkpointNext = async (): Promise<void> => {
      for (;;) {
        const index = nextIndex
        nextIndex++
        if (index >= ids.length) {
          return
        }
        const sessionId = ids[index]
        await this.checkpointSession(sessionId, {
          final: opts?.final === true,
          teardown: opts?.teardown === true
        })
          .then((result) => {
            // Why: deferred sessions stay dirty so the checkpoint timer keeps
            // retrying until their full-snapshot cooldown expires.
            if (result === 'done') {
              completed.add(sessionId)
            }
          })
          .catch((err) => console.warn('[history] checkpoint failed:', sessionId, err))
      }
    }
    // Why: snapshot serialization and checkpoint writes are CPU/disk heavy.
    // Dirty-session filtering keeps idle terminals out; this cap prevents one
    // tick from snapshotting every active dirty terminal at once.
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_CHECKPOINTS, ids.length) }, () =>
      checkpointNext()
    )
    await Promise.all(workers)
    return completed
  }

  // Why cooldown starts only after a session's FIRST full snapshot: a session
  // with no checkpoint on disk yet must be able to write one immediately or a
  // cold restore would find nothing.
  protected isFullCheckpointCoolingDown(sessionId: string): boolean {
    const last = this.lastFullCheckpointAt.get(sessionId)
    if (last === undefined) {
      return false
    }
    const elapsed = Date.now() - last
    // Why elapsed < 0 counts as expired: a backward wall-clock jump must not
    // extend the deferral window.
    return elapsed >= 0 && elapsed < FULL_CHECKPOINT_COOLDOWN_MS
  }

  // Why 'deferred' exists: a cap/overflow-triggered full snapshot inside the
  // cooldown window is postponed, and the session must STAY dirty so the 5s
  // timer keeps retrying until the cooldown expires. While deferred, no
  // takePendingOutput/append runs for the session — appending past a dropped
  // range would leave a hole in the log, whereas skipping keeps the on-disk
  // state a consistent (merely stale) prefix that the eventual full snapshot
  // re-anchors.
  protected async checkpointSession(
    sessionId: string,
    opts: { final: boolean; teardown: boolean }
  ): Promise<'done' | 'deferred'> {
    if (!this.supportsIncrementalCheckpoints) {
      const result = await this.client.request<GetSnapshotResult>('getSnapshot', { sessionId })
      if (result.snapshot && this.historyManager) {
        await this.historyManager.checkpoint(sessionId, result.snapshot)
      }
      return 'done'
    }
    if (opts.final || this.sessionsNeedingFullCheckpoint.has(sessionId)) {
      if (!opts.final && this.isFullCheckpointCoolingDown(sessionId)) {
        return 'deferred'
      }
      // Why take-with-snapshot instead of plain getSnapshot: the take clears
      // the daemon's pending records in the same synchronous turn as the
      // serialize. A plain snapshot would leave pre-snapshot records pending;
      // a later warm reattach would append them to the fresh log and cold
      // restore would replay them on top of a checkpoint that already
      // contains them.
      await this.takeSnapshotAndCheckpoint(sessionId, { teardown: opts.teardown })
      this.sessionsNeedingFullCheckpoint.delete(sessionId)
      return 'done'
    }
    const take = await this.client.request<TakePendingOutputResult | null>('takePendingOutput', {
      sessionId
    })
    if (!take) {
      return 'done'
    }
    if (take.overflowed) {
      // Why: overflow dropped records, so the log has a hole — only a full
      // snapshot (which reflects everything ever written) can re-anchor it.
      if (this.isFullCheckpointCoolingDown(sessionId)) {
        this.sessionsNeedingFullCheckpoint.add(sessionId)
        return 'deferred'
      }
      await this.takeSnapshotAndCheckpoint(sessionId, { teardown: false })
      return 'done'
    }
    if (take.records.length === 0) {
      return 'done'
    }
    if (!this.historyManager) {
      return 'done'
    }
    const appendResult = await this.historyManager.appendIncrements(
      sessionId,
      take.seq,
      take.records
    )
    if (appendResult === 'needs-checkpoint') {
      // Why dropping take.records is lossless: they were applied to the live
      // emulator before the take, so the snapshot below contains them.
      if (this.isFullCheckpointCoolingDown(sessionId)) {
        this.sessionsNeedingFullCheckpoint.add(sessionId)
        return 'deferred'
      }
      await this.takeSnapshotAndCheckpoint(sessionId, { teardown: false })
    }
    return 'done'
  }

  protected async takeSnapshotAndCheckpoint(
    sessionId: string,
    opts: { teardown: boolean }
  ): Promise<void> {
    const take = await this.client.request<TakePendingOutputResult | null>('takePendingOutput', {
      sessionId,
      includeSnapshot: true,
      teardownSnapshot: opts.teardown
    })
    if (take?.snapshot && this.historyManager) {
      await this.historyManager.checkpoint(sessionId, take.snapshot)
      this.lastFullCheckpointAt.set(sessionId, Date.now())
      if (take.records.length > 0) {
        // Why: take-with-snapshot usually returns no records because the
        // snapshot subsumes them. Held parser-state bytes, such as an
        // incomplete shell-ready marker prefix, are not representable in the
        // snapshot and must remain as a post-checkpoint log tail.
        await this.historyManager.appendIncrements(sessionId, take.seq, take.records)
      }
    }
  }
}
