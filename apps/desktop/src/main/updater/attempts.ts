import { app } from 'electron'
import type { RemoteServerUpdateInstallMode } from '~shared/remote-server-update'
import type { UpdateCheckOptions, UpdateStatus } from '~shared/types'

import { writeMainThreadDiagnosticMarker } from '../diagnostics/main-thread-churn-probe'
import { hasServeUpdateSupervisor } from '../serve-update-handoff'
import { compareVersions } from '../updater-fallback'
import type { UpdateCheckVariant } from './model'
import {
  AUTO_UPDATE_CHECK_INTERVAL_MS,
  AUTO_UPDATE_RETRY_INTERVAL_MS,
  UPDATE_CHECK_SILENT_SETTLE_DELAY_MS,
  UPDATE_CHECK_STALL_TIMEOUT_MS
} from './model'
import { UpdaterStatus } from './status'

export abstract class UpdaterAttempts extends UpdaterStatus {
  getOptionsForUpdateCheckVariant = (variant: UpdateCheckVariant): UpdateCheckOptions => {
    switch (variant) {
      case 'perf':
        return { includePrerelease: true, includePerfPrerelease: true }
      case 'prerelease':
        return { includePrerelease: true }
      case 'default':
        return { includePrerelease: false }
    }
  }

  getUpdateCheckVariant = (options?: UpdateCheckOptions): UpdateCheckVariant => {
    if (options?.includePerfPrerelease) {
      return 'perf'
    }
    if (options?.includePrerelease) {
      return 'prerelease'
    }
    return 'default'
  }

  launchPendingUserInitiatedCheckAfterInFlight = (variant: UpdateCheckVariant): void => {
    this.pendingUserInitiatedCheckAfterInFlight = null
    setTimeout(() => {
      // Why: electron-updater clears its in-flight promise after emitting the
      // terminal event. Deferring one tick lets the queued modifier check start
      // fresh instead of being deduped into the just-finished stable check.
      if (this.currentStatus.state === 'checking') {
        this.currentStatus = { state: 'idle' }
      }
      this.checkForUpdatesFromMenu(this.getOptionsForUpdateCheckVariant(variant))
    }, 0)
  }

  clearBackgroundCheckLaunchPending = (): void => {
    this.backgroundCheckLaunchPending = false
  }

  clearUpdateCheckStallTimer = (): void => {
    if (!this.updateCheckStallTimer) {
      return
    }
    clearTimeout(this.updateCheckStallTimer)
    this.updateCheckStallTimer = null
  }

  clearUpdateCheckSilentSettleTimer = (): void => {
    if (!this.updateCheckSilentSettleTimer) {
      return
    }
    clearTimeout(this.updateCheckSilentSettleTimer)
    this.updateCheckSilentSettleTimer = null
  }

  clearUpdateCheckTimers = (): void => {
    this.clearUpdateCheckStallTimer()
    this.clearUpdateCheckSilentSettleTimer()
  }

  finishActiveUpdateCheckAttempt = (): void => {
    this.activeUpdateCheckAttemptId = null
    this.activeUpdateCheckLaunchAttemptId = null
    this.activeUpdateCheckEventAttemptId = null
    this.clearUpdateCheckTimers()
  }

  getActiveUpdateCheckEventAttemptId = (): number | null => {
    if (this.activeUpdateCheckAttemptId === null) {
      return null
    }
    if (this.activeUpdateCheckEventAttemptId !== this.activeUpdateCheckAttemptId) {
      return null
    }
    return this.activeUpdateCheckAttemptId
  }

  isActiveUpdateCheckAttempt = (attemptId: number): boolean => {
    return this.activeUpdateCheckAttemptId === attemptId
  }

  markUpdateCheckEventAttempt = (): boolean => {
    if (this.activeUpdateCheckAttemptId === null) {
      return false
    }
    if (this.activeUpdateCheckLaunchAttemptId !== this.activeUpdateCheckAttemptId) {
      return false
    }
    this.activeUpdateCheckEventAttemptId = this.activeUpdateCheckAttemptId
    return true
  }

  markUpdateCheckLaunched = (attemptId: number): void => {
    if (!this.isActiveUpdateCheckAttempt(attemptId)) {
      return
    }
    this.activeUpdateCheckLaunchAttemptId = attemptId
  }

  markUpdateAvailableEventPending = (attemptId: number | null): void => {
    this.updateAvailableEventPendingAttemptId = attemptId
  }

  clearUpdateAvailableEventPending = (attemptId: number | null): void => {
    if (this.updateAvailableEventPendingAttemptId !== attemptId) {
      return
    }
    this.updateAvailableEventPendingAttemptId = null
  }

  armUpdateCheckStallTimer = (attemptId: number): void => {
    this.clearUpdateCheckStallTimer()
    this.updateCheckStallTimer = setTimeout(() => {
      this.updateCheckStallTimer = null
      if (!this.isActiveUpdateCheckAttempt(attemptId)) {
        return
      }
      const wasUserInitiated = this.getSettledCheckUserInitiated()
      if (this.currentStatus.state === 'checking') {
        this.finishActiveUpdateCheckAttempt()
        this.backgroundCheckLaunchPending = false
        this.backgroundCheckPromotedToUserInitiated = false
        this.userInitiatedCheck = false
        void this.sendCheckFailureStatus(
          'Update check timed out. Try again in a few minutes.',
          wasUserInitiated,
          'promise'
        )
        return
      }
      if (this.backgroundCheckLaunchPending) {
        this.finishActiveUpdateCheckAttempt()
        this.backgroundCheckLaunchPending = false
        this.backgroundCheckPromotedToUserInitiated = false
        this.userInitiatedCheck = false
        this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)
      }
    }, UPDATE_CHECK_STALL_TIMEOUT_MS)
  }

  beginUpdateCheckAttempt = (): number => {
    this.finishActiveUpdateCheckAttempt()
    this.updateAvailableEventPendingAttemptId = null
    this.updateCheckAttemptSequence += 1
    this.activeUpdateCheckAttemptId = this.updateCheckAttemptSequence
    this.armUpdateCheckStallTimer(this.activeUpdateCheckAttemptId)
    // Why: issue #7576's warnings recurred at the retry cadence; field captures
    // need a timestamp for each check attempt to confirm or rule the updater out.
    writeMainThreadDiagnosticMarker('updater-check-attempt')
    return this.activeUpdateCheckAttemptId
  }

  rearmActiveUpdateCheckStallTimer = (): void => {
    if (this.activeUpdateCheckAttemptId === null) {
      return
    }
    this.armUpdateCheckStallTimer(this.activeUpdateCheckAttemptId)
  }

  getSettledCheckUserInitiated = (): boolean | undefined => {
    return this.userInitiatedCheck || this.backgroundCheckPromotedToUserInitiated || undefined
  }

  isUpdateCheckResultState = (state: UpdateStatus['state']): boolean => {
    return (
      state === 'idle' ||
      state === 'not-available' ||
      state === 'available' ||
      state === 'error' ||
      state === 'downloading' ||
      state === 'downloaded'
    )
  }

  consumeSilentCheckShortRetryReason = (): boolean => {
    if (this.publishingWindowLastGoodCheck !== null) {
      return true
    }
    return this.consumeMissingManifestPrereleaseFallbackResult() !== null
  }

  completeSilentUpdateCheck = (userInitiated: boolean | undefined): boolean => {
    const shouldRetrySoon = this.consumeSilentCheckShortRetryReason()
    this.clearAvailableUpdateContext()
    if (shouldRetrySoon) {
      // Why: a silent result against a temporary last-good feed is still part of
      // a release transition, so it must not suppress the short publish retry.
      this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)
      return true
    }
    this.recordCompletedUpdateCheck()
    if (!userInitiated) {
      this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
    }
    return false
  }

  settleSilentUpdateCheck = (attemptId: number, userInitiated: boolean | undefined): void => {
    if (!this.isActiveUpdateCheckAttempt(attemptId)) {
      return
    }
    if (this.updateAvailableEventPendingAttemptId === attemptId) {
      return
    }
    if (this.currentStatus.state !== 'checking') {
      if (this.backgroundCheckLaunchPending) {
        this.finishActiveUpdateCheckAttempt()
        this.clearBackgroundCheckLaunchPending()
        this.backgroundCheckPromotedToUserInitiated = false
        this.userInitiatedCheck = false
        const shouldRetrySoon = this.completeSilentUpdateCheck(userInitiated)
        if (this.awaitingNudgeCheckOutcome) {
          if (shouldRetrySoon) {
            this.deferPendingUpdateNudgeUntilRetry()
            return
          }
          this.sendStatus({ state: 'not-available', userInitiated })
        }
      }
      return
    }
    this.finishActiveUpdateCheckAttempt()
    this.clearBackgroundCheckLaunchPending()
    this.backgroundCheckPromotedToUserInitiated = false
    this.userInitiatedCheck = false
    this.completeSilentUpdateCheck(userInitiated)
    this.sendStatus({ state: 'not-available', userInitiated })
  }

  handleSettledUpdateCheckPromise = (attemptId: number): void => {
    if (!this.isActiveUpdateCheckAttempt(attemptId)) {
      return
    }
    this.clearUpdateCheckSilentSettleTimer()
    // Why: electron-updater can resolve its promise before the terminal event
    // reaches our handlers. Give that event a short grace period, then unstick
    // checks that genuinely resolved without one.
    this.updateCheckSilentSettleTimer = setTimeout(() => {
      this.updateCheckSilentSettleTimer = null
      this.settleSilentUpdateCheck(attemptId, this.getSettledCheckUserInitiated())
    }, UPDATE_CHECK_SILENT_SETTLE_DELAY_MS)
  }

  shouldHandleUpdaterErrorEvent = (): boolean => {
    if (this.getActiveUpdateCheckEventAttemptId() !== null) {
      return true
    }
    // Why: electron-updater emits check errors globally. Once a check has
    // settled, only active download/install flows should keep consuming errors.
    return (
      this.downloadInFlight ||
      this.currentStatus.state === 'downloading' ||
      this.currentStatus.state === 'downloaded'
    )
  }

  sendErrorStatus = (message: string, userInitiated?: boolean): void => {
    if (
      this.currentStatus.state === 'error' &&
      this.currentStatus.message === message &&
      this.currentStatus.userInitiated === userInitiated
    ) {
      return
    }
    this.sendStatus({ state: 'error', message, userInitiated })
  }

  getKnownReleaseUrl = (): string | undefined => {
    return this.availableReleaseUrl ?? undefined
  }

  hasNewerDownloadedVersion = (): boolean => {
    return (
      this.availableVersion !== null && compareVersions(this.availableVersion, app.getVersion()) > 0
    )
  }

  getPendingInstallVersion = (): string => {
    if (this.availableVersion) {
      return this.availableVersion
    }
    if (this.currentStatus.state === 'downloading' || this.currentStatus.state === 'downloaded') {
      return this.currentStatus.version
    }
    return ''
  }

  getCheckFailureKey = (message: string, userInitiated?: boolean): string => {
    return `${userInitiated ? 'user' : 'auto'}:${message}`
  }

  resolveUpdateInstallMode = (isServeMode: boolean): RemoteServerUpdateInstallMode => {
    if (!isServeMode) {
      return 'interactive'
    }
    return hasServeUpdateSupervisor() ? 'supervised-headless-serve' : 'unsupported-headless-serve'
  }

  clearPrereleaseFallbackContextIfSettled = (): void => {
    if (
      this.pendingPrereleaseFallback?.fallbackResultHandled &&
      !this.pendingPrereleaseFallback.suppressedPrimaryPromiseFailureKey &&
      !this.pendingPrereleaseFallback.suppressedPrimaryEventFailure &&
      !this.pendingPrereleaseFallback.suppressedFallbackPromiseFailureKey &&
      !this.pendingPrereleaseFallback.suppressedFallbackEventFailureKey
    ) {
      this.clearPrereleaseFallbackContext()
    }
  }
}
