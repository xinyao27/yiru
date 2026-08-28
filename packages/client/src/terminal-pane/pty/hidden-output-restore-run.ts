import type { PtyBufferSnapshot } from './transport-types'

type DrainOutcome = 'drained' | 'overflow' | 'refetch'

type HiddenOutputRestoreRunOptions = {
  getIsDisposed: () => boolean
  getPtyId: () => string | null
  getRestorePtyId: () => string | null
  getGeneration: () => number
  canUseSnapshot: (ptyId: string) => boolean
  clearState: () => void
  writeUnavailableWarning: () => void
  setNeeded: (needed: boolean) => void
  serializeSnapshot: (ptyId: string) => Promise<PtyBufferSnapshot | null>
  deferRetry: () => void
  resetRetryAttempts: () => void
  applySnapshot: (snapshot: PtyBufferSnapshot) => Promise<void>
  setSnapshotBaseline: (ptyId: string, snapshot: PtyBufferSnapshot) => void
  takeFreshSnapshotNeeded: () => boolean
  drainAfterSnapshot: (snapshotSeq: number | undefined) => DrainOutcome
  getIsForeground: () => boolean
  complete: () => void
  noteFloodBackpressure: () => void
  abandonForeground: (ptyId: string) => void
  warnIterationCap: (ptyId: string, outcome: DrainOutcome) => void
}

const MAX_LOOP_ITERATIONS = 3

export async function runHiddenOutputRestore(
  options: HiddenOutputRestoreRunOptions
): Promise<void> {
  let restoreIterations = 0
  while (!options.getIsDisposed()) {
    const currentPtyId = options.getRestorePtyId()
    if (currentPtyId === null) {
      options.clearState()
      return
    }
    if (!options.canUseSnapshot(currentPtyId)) {
      if (options.getRestorePtyId() === currentPtyId) {
        options.clearState()
      }
      options.writeUnavailableWarning()
      return
    }
    if (options.getPtyId() !== currentPtyId) {
      if (options.getRestorePtyId() === currentPtyId) {
        options.clearState()
      }
      return
    }
    const restoreGeneration = options.getGeneration()
    options.setNeeded(false)
    const snapshot = await options.serializeSnapshot(currentPtyId)
    if (options.getIsDisposed()) {
      return
    }
    const restorePtyChanged =
      options.getPtyId() !== currentPtyId || options.getRestorePtyId() !== currentPtyId
    if (options.getGeneration() !== restoreGeneration || restorePtyChanged) {
      // Why: the snapshot belongs to the requested PTY; after reattach,
      // replaying it would show stale output in the new terminal.
      if (restorePtyChanged && options.getRestorePtyId() === currentPtyId) {
        options.clearState()
      }
      return
    }
    if (!snapshot) {
      options.setNeeded(true)
      options.deferRetry()
      return
    }
    options.resetRetryAttempts()
    restoreIterations += 1
    await options.applySnapshot(snapshot)
    if (
      options.getIsDisposed() ||
      options.getGeneration() !== restoreGeneration ||
      options.getRestorePtyId() !== currentPtyId ||
      options.getPtyId() !== currentPtyId
    ) {
      return
    }
    options.setSnapshotBaseline(currentPtyId, snapshot)
    const needsFreshSnapshot = options.takeFreshSnapshotNeeded()
    const drainOutcome = options.drainAfterSnapshot(snapshot.seq)
    if (drainOutcome === 'drained' && !needsFreshSnapshot) {
      options.complete()
      return
    }
    if (!options.getIsForeground()) {
      // Why: hidden bytes arriving during a snapshot were not retained by the
      // renderer. Leave recovery pending until the pane is visible again.
      options.setNeeded(true)
      return
    }
    if (drainOutcome === 'overflow') {
      options.noteFloodBackpressure()
      options.abandonForeground(currentPtyId)
      return
    }
    if (restoreIterations >= MAX_LOOP_ITERATIONS) {
      options.warnIterationCap(currentPtyId, drainOutcome)
      options.noteFloodBackpressure()
      options.abandonForeground(currentPtyId)
      return
    }
    options.setNeeded(true)
  }
}
