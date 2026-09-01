import { containsStatefulRendererQuery } from '~renderer/terminal/reply-query-extraction'

import { createHiddenOutputRestoreQueue } from './hidden-output-restore-queue'
import { runHiddenOutputRestore } from './hidden-output-restore-run'
import { createHiddenOutputRestoreTiming } from './hidden-output-restore-timing'
import type {
  HiddenOutputRestoreController,
  HiddenOutputRestoreOptions
} from './hidden-output-restore-types'
import { createHiddenOutputSchedule } from './hidden-output-schedule'
import { createHiddenOutputSnapshotReplay } from './hidden-output-snapshot-replay'

export function createHiddenOutputRestoreController(
  options: HiddenOutputRestoreOptions
): HiddenOutputRestoreController {
  let isNeeded = false
  let inFlight: Promise<void> | null = null
  let needsFreshSnapshot = false
  let isRetryDeferred = false
  let restorePtyId: string | null = null
  let generation = 0
  let isRendererStateDirty = false
  const queue = createHiddenOutputRestoreQueue({
    orderedOutput: options.orderedOutput,
    salvageDiscarded: options.query.salvageDiscarded,
    writeForeground: options.writeForeground,
    onActivity: () => timing.armForegroundDeadline()
  })
  const timing = createHiddenOutputRestoreTiming({
    getIsDisposed: options.getIsDisposed,
    getIsForeground: options.getIsForeground,
    getPtyId: options.getPtyId,
    getRestorePtyId: () => restorePtyId,
    getGeneration: () => generation,
    hasPending: () => queue.hasPending() || queue.isOverflowed(),
    getNeedsRestore: () => isNeeded,
    onFloodQuiet: () => markNeeded(),
    onForegroundTimeout: (ptyId) => abandon(ptyId),
    onDeferredRetry: () => {
      isRetryDeferred = false
      request()
    },
    onDeferredRetryExhausted: (ptyId) => {
      if (ptyId) {
        abandon(ptyId)
      } else {
        clear()
        options.writeUnavailableWarning()
      }
    }
  })
  const snapshotReplay = createHiddenOutputSnapshotReplay({
    pane: options.pane,
    coordinator: options.coordinator,
    orderedOutput: options.orderedOutput,
    getIsDisposed: options.getIsDisposed,
    getPtyId: options.getPtyId,
    getGeneration: () => generation,
    setSuppressPtyResize: options.setSuppressPtyResize,
    writeReplayData: options.writeReplayData,
    hasLiveAgent: options.hasLiveAgent,
    isRendererPtyResizeAuthoritative: options.isRendererPtyResizeAuthoritative,
    resizePty: options.resizePty,
    onSnapshotApplied: () => {
      isRendererStateDirty = false
      options.resetHiddenRendererRisk()
    },
    onCurrentRestoreSettled: options.onRestoreSettled
  })
  const schedule = createHiddenOutputSchedule({
    terminal: options.pane.terminal,
    getIsDisposed: options.getIsDisposed,
    getGeneration: () => generation,
    getRestorePtyId: () => restorePtyId,
    getPtyId: options.getPtyId,
    canUseSnapshot: options.canUseSnapshot,
    hasWork: () => isNeeded || queue.hasPending(),
    getIsForeground: options.getIsForeground,
    run: () => request(true)
  })

  function clearPending(): void {
    queue.clear()
    needsFreshSnapshot = false
    isRetryDeferred = false
    schedule.clear()
    timing.clearDeferredRetry()
    timing.clearForegroundDeadline()
    timing.resetDeferredRetryAttempts()
  }

  function clear(): void {
    snapshotReplay.cancel()
    clearPending()
    options.query.resetPending()
    isRendererStateDirty = false
    options.resetHiddenRendererRisk()
    isNeeded = false
    restorePtyId = null
    generation += 1
  }

  function abandon(expectedPtyId: string, quiet = false): void {
    if (options.getPtyId() !== expectedPtyId || restorePtyId !== expectedPtyId) {
      resetIfPtyChanged()
      return
    }
    const pending = queue.takeForAbandonment()
    generation += 1
    snapshotReplay.retargetGeneration(expectedPtyId, generation)
    inFlight = null
    isNeeded = false
    restorePtyId = null
    clearPending()
    options.query.resetPending()
    isRendererStateDirty = false
    options.resetHiddenRendererRisk()
    if (!quiet) {
      options.writeUnavailableWarning()
    }
    if (!pending.hadOverflow) {
      const data = pending.chunks.map((chunk) => chunk.data).join('')
      if (data) {
        options.writeForeground(data)
      }
    }
  }

  function resetIfPtyChanged(): void {
    if (restorePtyId !== null && options.getPtyId() !== restorePtyId) {
      clear()
      options.orderedOutput.clearSnapshotBaseline()
      options.query.clearModeState()
      timing.resetFloodSuppression()
      options.discardTerminalOutput()
    }
  }

  function markNeeded(): void {
    options.resetSkippedRendererRisk()
    const ptyId = options.getPtyId()
    if (!options.canUseSnapshot(ptyId)) {
      return
    }
    if (restorePtyId !== null && restorePtyId !== ptyId) {
      clear()
    }
    restorePtyId = ptyId
    isNeeded = true
    if (options.getIsForeground()) {
      request()
    }
  }

  function request(bypassScheduler = false): boolean {
    if (!options.ensureWritePipelineAvailable()) {
      return false
    }
    resetIfPtyChanged()
    const ptyId = restorePtyId ?? options.getPtyId()
    if ((!isNeeded && !queue.hasPending()) || !options.canUseSnapshot(ptyId)) {
      return false
    }
    restorePtyId = ptyId
    if (inFlight) {
      timing.armForegroundDeadline()
      return true
    }
    if (!bypassScheduler && !options.getIsActive()) {
      schedule.deferInactive(ptyId)
      return true
    }
    schedule.clear()
    timing.clearDeferredRetry()
    isRetryDeferred = false
    inFlight = runHiddenOutputRestore({
      getIsDisposed: options.getIsDisposed,
      getPtyId: options.getPtyId,
      getRestorePtyId: () => restorePtyId,
      getGeneration: () => generation,
      canUseSnapshot: (currentPtyId) => options.canUseSnapshot(currentPtyId),
      clearState: clear,
      writeUnavailableWarning: options.writeUnavailableWarning,
      setNeeded: (needed) => {
        isNeeded = needed
      },
      serializeSnapshot: options.serializeSnapshot,
      deferRetry: () => {
        needsFreshSnapshot = false
        isRetryDeferred = true
        timing.scheduleDeferredRetry()
      },
      resetRetryAttempts: timing.resetDeferredRetryAttempts,
      applySnapshot: snapshotReplay.apply,
      setSnapshotBaseline: options.orderedOutput.setSnapshotBaseline,
      takeFreshSnapshotNeeded: () => {
        const needed = needsFreshSnapshot
        needsFreshSnapshot = false
        return needed
      },
      drainAfterSnapshot: queue.drainAfterSnapshot,
      getIsForeground: options.getIsForeground,
      complete: () => {
        isNeeded = false
        restorePtyId = null
        timing.clearForegroundDeadline()
      },
      noteFloodBackpressure: timing.noteFloodBackpressure,
      abandonForeground: (currentPtyId) => abandon(currentPtyId, true),
      warnIterationCap: options.warnIterationCap
    })
    const task = inFlight
    let tracked: Promise<void>
    tracked = task.finally(() => {
      if (inFlight === tracked) {
        inFlight = null
      }
      if (queue.hasPending() || queue.isOverflowed()) {
        isNeeded = true
        timing.armForegroundDeadline()
      }
      if (!isRetryDeferred && isNeeded && options.getIsForeground()) {
        request()
      }
    })
    inFlight = tracked
    return true
  }

  return {
    getState: () => ({
      appliesToCurrentPty: restorePtyId !== null && options.getPtyId() === restorePtyId,
      isNeeded,
      isInFlight: inFlight !== null
    }),
    markNeeded,
    markFreshSnapshotNeeded: () => {
      isNeeded = true
      needsFreshSnapshot = true
    },
    shouldSkipRendererOutput: (foreground, data) =>
      !foreground &&
      options.shouldSnapshotHiddenOutput &&
      options.canUseSnapshot(options.getPtyId()) &&
      (isRendererStateDirty || !containsStatefulRendererQuery(data)),
    skipRendererOutput: (data) => {
      options.query.observeSkipped(data)
      markNeeded()
      isRendererStateDirty = true
      if (inFlight) {
        needsFreshSnapshot = true
      }
    },
    queueLiveChunk: (data, meta) => {
      const ptyId = options.getPtyId()
      if (!data || !options.canUseSnapshot(ptyId)) {
        return
      }
      if (restorePtyId !== null && restorePtyId !== ptyId) {
        clear()
      }
      restorePtyId = ptyId
      isNeeded = true
      queue.queue(data, meta)
    },
    request: () => request(),
    clear,
    cancelSnapshotReplay: snapshotReplay.cancel,
    resetIfPtyChanged,
    isForegroundBackpressure: () => timing.isForegroundBackpressure(inFlight !== null),
    noteFloodBackpressure: timing.noteFloodBackpressure,
    markRendererStateDirty: () => {
      isRendererStateDirty = true
    },
    dispose: timing.dispose
  }
}
