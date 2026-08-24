import type { UpdateStatus } from '~shared/types'

import { loadElectronAutoUpdater, type ElectronAutoUpdater } from '../electron-updater-loader'
import { publishShellEvent } from '../shell/events'
import { statusesEqual } from '../updater-fallback'
import { UpdaterContract } from './contract'

export abstract class UpdaterStatus extends UpdaterContract {
  getAutoUpdater = (): ElectronAutoUpdater => {
    if (!this.autoUpdater) {
      this.autoUpdater = loadElectronAutoUpdater()
    }
    return this.autoUpdater
  }

  clearAvailableUpdateContext = (): void => {
    this.availableVersion = null
    this.availableReleaseUrl = null
  }

  clearPrereleaseFallbackContext = (): void => {
    this.pendingPrereleaseFallback = null
  }

  clearPendingUpdateNudge = (): void => {
    this.activeUpdateNudgeId = null
    this.awaitingNudgeCheckOutcome = false
    this._setPendingUpdateNudgeId?.(null)
  }

  deferPendingUpdateNudgeUntilRetry = (): void => {
    this.activeUpdateNudgeId = null
    this.awaitingNudgeCheckOutcome = false
  }

  clearPublishingWindowLastGoodCheck = (): void => {
    this.publishingWindowLastGoodCheck = null
  }

  getPublishingWindowLastGoodCheck = (): { lastGoodTag: string } | null => {
    return this.publishingWindowLastGoodCheck
  }

  getPersistedPendingUpdateNudgeId = (): string | null => {
    return this._getPendingUpdateNudgeId?.() ?? null
  }

  decorateStatusWithActiveNudge = (status: UpdateStatus): UpdateStatus => {
    // Why: only actionable/error states carry the nudge marker so the renderer
    // can tell whether a dismiss should also acknowledge the campaign. Cycle-
    // boundary states (idle, checking, not-available) never need it.
    if (!this.activeUpdateNudgeId) {
      return status
    }
    if (
      status.state === 'idle' ||
      status.state === 'checking' ||
      status.state === 'not-available'
    ) {
      return status
    }
    return { ...status, activeNudgeId: this.activeUpdateNudgeId }
  }

  sendStatus = (status: UpdateStatus): void => {
    const pendingUserInitiatedCheckVariant = this.pendingUserInitiatedCheckAfterInFlight
    const shouldLaunchPendingUserInitiatedCheck =
      pendingUserInitiatedCheckVariant !== null &&
      (status.state === 'idle' ||
        status.state === 'not-available' ||
        status.state === 'available' ||
        status.state === 'error')
    const shouldPreserveNudgeForPublishingWindow =
      this.publishingWindowLastGoodCheck !== null &&
      (status.state === 'idle' ||
        status.state === 'not-available' ||
        status.state === 'available' ||
        status.state === 'error')
    if (this.awaitingNudgeCheckOutcome) {
      if (status.state === 'available') {
        if (shouldPreserveNudgeForPublishingWindow) {
          // Why: a last-good available update is only a temporary fallback; don't
          // let dismissing that card consume the newest-release nudge campaign.
          this.deferPendingUpdateNudgeUntilRetry()
        } else {
          this.awaitingNudgeCheckOutcome = false
        }
      } else if (
        status.state === 'idle' ||
        status.state === 'not-available' ||
        status.state === 'error'
      ) {
        if (shouldPreserveNudgeForPublishingWindow) {
          // Why: last-good checks can legitimately say "not available" while
          // the campaign's newest release is still publishing.
          this.deferPendingUpdateNudgeUntilRetry()
        } else {
          // Why: when a nudge-triggered check finds no update (or errors out),
          // move the campaign to dismissed so it doesn't re-fire on the next
          // poll cycle. Without this, a nudge whose version range includes
          // already-up-to-date users would loop every 30 minutes, each time
          // triggering a redundant checkForUpdates() and clearing the persisted
          // dismissedUpdateVersion.
          if (this.activeUpdateNudgeId) {
            this._setDismissedUpdateNudgeId?.(this.activeUpdateNudgeId)
          }
          this.clearPendingUpdateNudge()
        }
      }
    }

    const decoratedStatus = this.decorateStatusWithActiveNudge(status)

    if (this.isUpdateCheckResultState(status.state)) {
      this.finishActiveUpdateCheckAttempt()
    }

    if (
      status.state === 'idle' ||
      status.state === 'not-available' ||
      status.state === 'available' ||
      status.state === 'error'
    ) {
      this.clearPublishingWindowLastGoodCheck()
    }

    // Why: reset the in-flight guard when the status moves past the
    // window where duplicate download() calls are possible.
    if (
      decoratedStatus.state === 'downloading' ||
      decoratedStatus.state === 'error' ||
      decoratedStatus.state === 'idle'
    ) {
      this.downloadInFlight = false
    }
    if (shouldLaunchPendingUserInitiatedCheck) {
      this.launchPendingUserInitiatedCheckAfterInFlight(pendingUserInitiatedCheckVariant)
      return
    }
    if (statusesEqual(this.currentStatus, decoratedStatus)) {
      return
    }
    this.currentStatus = decoratedStatus
    if (this.mainWindowRef?.webContents.id !== undefined) {
      publishShellEvent(this.mainWindowRef.webContents.id, {
        type: 'updaterStatus',
        status: decoratedStatus
      })
    }
  }
}
