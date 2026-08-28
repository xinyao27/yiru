const DEFERRED_RETRY_MS = 50
const DEFERRED_RETRY_MAX = 3
const FOREGROUND_TIMEOUT_MS = 750
const FLOOD_SUPPRESS_MS = 2000

type HiddenOutputRestoreTimingOptions = {
  getIsDisposed: () => boolean
  getIsForeground: () => boolean
  getPtyId: () => string | null
  getRestorePtyId: () => string | null
  getGeneration: () => number
  hasPending: () => boolean
  getNeedsRestore: () => boolean
  onFloodQuiet: () => void
  onForegroundTimeout: (ptyId: string) => void
  onDeferredRetry: () => void
  onDeferredRetryExhausted: (ptyId: string | null) => void
}

export type HiddenOutputRestoreTiming = {
  isFloodSuppressed: () => boolean
  isForegroundBackpressure: (isRestoreInFlight: boolean) => boolean
  noteFloodBackpressure: () => void
  resetFloodSuppression: () => void
  armForegroundDeadline: () => void
  clearForegroundDeadline: () => void
  scheduleDeferredRetry: () => void
  clearDeferredRetry: () => void
  resetDeferredRetryAttempts: () => void
  dispose: () => void
}

export function createHiddenOutputRestoreTiming(
  options: HiddenOutputRestoreTimingOptions
): HiddenOutputRestoreTiming {
  let deferredRetryTimer: ReturnType<typeof setTimeout> | null = null
  let foregroundDeadlineTimer: ReturnType<typeof setTimeout> | null = null
  let floodRepaintTimer: ReturnType<typeof setTimeout> | null = null
  let deferredRetryAttempts = 0
  let floodSuppressedUntil = 0

  const clearDeferredRetry = (): void => {
    if (deferredRetryTimer !== null) {
      clearTimeout(deferredRetryTimer)
      deferredRetryTimer = null
    }
  }

  const clearForegroundDeadline = (): void => {
    if (foregroundDeadlineTimer !== null) {
      clearTimeout(foregroundDeadlineTimer)
      foregroundDeadlineTimer = null
    }
  }

  const clearFloodRepaint = (): void => {
    if (floodRepaintTimer !== null) {
      clearTimeout(floodRepaintTimer)
      floodRepaintTimer = null
    }
  }

  const resetFloodSuppression = (): void => {
    floodSuppressedUntil = 0
    clearFloodRepaint()
  }

  const armForegroundDeadline = (): void => {
    if (
      options.getIsDisposed() ||
      foregroundDeadlineTimer !== null ||
      !options.getIsForeground() ||
      !options.hasPending()
    ) {
      return
    }
    const ptyId = options.getRestorePtyId()
    if (ptyId === null || options.getPtyId() !== ptyId) {
      return
    }
    const generation = options.getGeneration()
    // Why: only foreground-visible output blocked behind recovery gets a
    // deadline; hidden-time restore work can continue without user impact.
    foregroundDeadlineTimer = setTimeout(() => {
      foregroundDeadlineTimer = null
      if (
        options.getIsDisposed() ||
        options.getGeneration() !== generation ||
        options.getRestorePtyId() !== ptyId ||
        !options.getIsForeground()
      ) {
        return
      }
      options.onForegroundTimeout(ptyId)
    }, FOREGROUND_TIMEOUT_MS)
  }

  const scheduleDeferredRetry = (): void => {
    if (options.getIsDisposed() || deferredRetryTimer !== null || !options.getIsForeground()) {
      return
    }
    if (deferredRetryAttempts >= DEFERRED_RETRY_MAX) {
      options.onDeferredRetryExhausted(options.getRestorePtyId())
      return
    }
    deferredRetryAttempts += 1
    // Why: null requested snapshots usually mean remote output was still
    // mutating. Retry after one quiet tick instead of spinning synchronously.
    deferredRetryTimer = setTimeout(() => {
      deferredRetryTimer = null
      if (!options.getIsDisposed() && options.getNeedsRestore()) {
        options.onDeferredRetry()
      }
    }, DEFERRED_RETRY_MS)
  }

  return {
    isFloodSuppressed: () => Date.now() < floodSuppressedUntil,
    isForegroundBackpressure: (isRestoreInFlight) =>
      options.getIsForeground() && (isRestoreInFlight || Date.now() < floodSuppressedUntil),
    noteFloodBackpressure: () => {
      floodSuppressedUntil = Date.now() + FLOOD_SUPPRESS_MS
      const ptyId = options.getPtyId()
      if (ptyId === null) {
        return
      }
      clearFloodRepaint()
      floodRepaintTimer = setTimeout(() => {
        floodRepaintTimer = null
        if (!options.getIsDisposed() && options.getPtyId() === ptyId) {
          options.onFloodQuiet()
        }
      }, FLOOD_SUPPRESS_MS)
    },
    resetFloodSuppression,
    armForegroundDeadline,
    clearForegroundDeadline,
    scheduleDeferredRetry,
    clearDeferredRetry,
    resetDeferredRetryAttempts: () => {
      deferredRetryAttempts = 0
    },
    dispose: () => {
      clearDeferredRetry()
      clearForegroundDeadline()
      resetFloodSuppression()
    }
  }
}
