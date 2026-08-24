import type { MissingManifestPrereleaseFallbackResult } from './model'
import { AUTO_UPDATE_RETRY_INTERVAL_MS, MAX_AUTO_UPDATE_RETRY_INTERVAL_MS } from './model'
import { UpdaterRemoteServer } from './remote-server'

export abstract class UpdaterScheduling extends UpdaterRemoteServer {
  scheduleAutomaticUpdateCheck = (delayMs: number): void => {
    let effectiveDelayMs = delayMs
    // All retry-cadence callers (here and updater-events) pass exactly this
    // constant, so keying the backoff on it keeps one choke point instead of
    // threading a flag through seven schedule sites.
    if (delayMs === AUTO_UPDATE_RETRY_INTERVAL_MS) {
      effectiveDelayMs = Math.min(
        AUTO_UPDATE_RETRY_INTERVAL_MS * 2 ** this.consecutiveAutomaticRetrySchedules,
        MAX_AUTO_UPDATE_RETRY_INTERVAL_MS
      )
      this.consecutiveAutomaticRetrySchedules += 1
    }
    if (this.autoUpdateCheckTimer) {
      clearTimeout(this.autoUpdateCheckTimer)
    }
    this.autoUpdateCheckTimer = setTimeout(() => {
      // Why: Yiru is often left running for days. A one-shot startup check means
      // users can miss fresh releases entirely, so we always keep the next
      // background attempt scheduled in the main process instead of tying checks
      // to relaunches or renderer lifetime.
      this.runBackgroundUpdateCheck()
    }, effectiveDelayMs)
  }

  recordCompletedUpdateCheck = (): void => {
    this.consecutiveAutomaticRetrySchedules = 0
    this.persistLastUpdateCheckAt?.(Date.now())
  }

  getMissingManifestPrereleaseFallbackUserInitiated = (): boolean | null => {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return null
    }
    return this.pendingPrereleaseFallback.userInitiated
  }

  markMissingManifestPrereleaseFallbackChecking = (): void => {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return
    }
    this.pendingPrereleaseFallback.fallbackCheckingForUpdateSeen = true
  }

  consumeMissingManifestPrereleaseFallbackResult =
    (): MissingManifestPrereleaseFallbackResult | null => {
      if (
        !this.pendingPrereleaseFallback?.retryLaunched ||
        this.pendingPrereleaseFallback.fallbackResultHandled
      ) {
        return null
      }
      const result = { userInitiated: this.pendingPrereleaseFallback.userInitiated }
      this.pendingPrereleaseFallback.fallbackResultHandled = true
      this.clearPrereleaseFallbackContextIfSettled()
      return result
    }

  suppressMissingManifestPrereleaseFallbackPromiseFailure = (message: string): void => {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return
    }
    this.pendingPrereleaseFallback.suppressedFallbackPromiseFailureKey = this.getCheckFailureKey(
      message,
      this.pendingPrereleaseFallback.userInitiated
    )
  }

  shouldSuppressMissingManifestPrereleaseFallbackEvent = (
    message: string,
    error: unknown
  ): boolean => {
    if (!this.pendingPrereleaseFallback?.retryLaunched) {
      return false
    }
    const failureKey = this.getCheckFailureKey(
      message,
      this.pendingPrereleaseFallback.userInitiated
    )
    const primaryEventSuppression = this.pendingPrereleaseFallback.suppressedPrimaryEventFailure
    if (primaryEventSuppression?.failureKey === failureKey) {
      const isPrimaryPromisePair = primaryEventSuppression.error === error
      // Why: after fallback checking starts, same-message errors may belong to
      // the fallback attempt, so message matching alone is not safe.
      if (isPrimaryPromisePair || !this.pendingPrereleaseFallback.fallbackCheckingForUpdateSeen) {
        this.pendingPrereleaseFallback.suppressedPrimaryEventFailure = null
        this.clearPrereleaseFallbackContextIfSettled()
        return true
      }
    }
    if (this.pendingPrereleaseFallback.suppressedFallbackEventFailureKey === failureKey) {
      this.pendingPrereleaseFallback.suppressedFallbackEventFailureKey = null
      this.clearPrereleaseFallbackContextIfSettled()
      return true
    }
    return false
  }

  markMissingManifestPrereleaseFallbackPromiseHandled = (message: string): void => {
    if (
      !this.pendingPrereleaseFallback?.retryLaunched ||
      this.pendingPrereleaseFallback.fallbackResultHandled
    ) {
      return
    }
    this.pendingPrereleaseFallback.suppressedFallbackEventFailureKey = this.getCheckFailureKey(
      message,
      this.pendingPrereleaseFallback.userInitiated
    )
  }
}
