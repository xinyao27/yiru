import { is } from '@electron-toolkit/utils'
import { YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL } from '@yiru/workbench-model/product'
import { app, powerMonitor } from 'electron'

import { registerAutoUpdaterHandlers } from '../updater-events'
import { beginMacUpdateDownload } from '../updater-mac-install'
import { UpdaterChecks } from './checks'
import type { UpdaterStatusTarget } from './model'
import { AUTO_UPDATE_CHECK_INTERVAL_MS } from './model'

export abstract class UpdaterEvents extends UpdaterChecks {
  setupAutoUpdater = (
    mainWindow: UpdaterStatusTarget,
    opts?: {
      getLastUpdateCheckAt?: () => number | null
      onBeforeQuit?: () => void | Promise<void>
      setLastUpdateCheckAt?: (timestamp: number) => void
      getPendingUpdateNudgeId?: () => string | null
      setPendingUpdateNudgeId?: (id: string | null) => void
      setDismissedUpdateNudgeId?: (id: string | null) => void
    }
  ): void => {
    this.mainWindowRef = mainWindow
    this.onBeforeQuitCleanup = opts?.onBeforeQuit ?? null
    this.persistLastUpdateCheckAt = opts?.setLastUpdateCheckAt ?? null
    this._getLastUpdateCheckAt = opts?.getLastUpdateCheckAt ?? null
    this._getPendingUpdateNudgeId = opts?.getPendingUpdateNudgeId ?? null
    this._setPendingUpdateNudgeId = opts?.setPendingUpdateNudgeId ?? null
    this._setDismissedUpdateNudgeId = opts?.setDismissedUpdateNudgeId ?? null

    if (!app.isPackaged && !is.dev) {
      return
    }
    if (is.dev) {
      return
    }

    const autoUpdater = this.getAutoUpdater()
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    // Why: the only on-machine window we have into electron-updater. Without
    // this, an unexpected `update-not-available` (e.g. RC user not offered
    // newer stable) is invisible — we can't tell whether the manifest fetch
    // got the wrong version, the request failed, or a stale in-flight check
    // was deduped. Logs go to main-process stdout, captured on macOS by
    // Console.app under the app bundle, and on Win/Linux by --enable-logging.
    autoUpdater.logger = {
      info: (m: unknown) => console.info('[autoUpdater]', m),
      warn: (m: unknown) => console.warn('[autoUpdater]', m),
      error: (m: unknown) => console.error('[autoUpdater]', m),
      debug: (m: unknown) => console.debug('[autoUpdater]', m)
    } as never

    // Why: Windows update integrity is enforced by electron-updater's built-in
    // Authenticode check against the `publisherName` (SignPath Foundation) that
    // electron-builder embeds in app-update.yml. Do NOT re-add a
    // `verifyUpdateCodeSignature` override — a no-op override silently accepts
    // every downloaded installer, disabling signature verification entirely.

    // Use the generic provider with GitHub's /releases/latest/download/ URL as
    // the startup fallback so electron-updater can fetch the manifest
    // (latest-mac.yml, latest.yml, latest-linux.yml) from the latest
    // non-prerelease release.
    //
    // Why: before each default-channel check we repin this URL to a concrete
    // /releases/download/<tag>/ URL. Keeping the generic provider avoids the
    // native GitHub provider's RC channel filtering, and pinning avoids the
    // moving /latest redirect changing between check and download.
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL
    })

    if (this.autoUpdaterInitialized) {
      return
    }
    this.autoUpdaterInitialized = true

    registerAutoUpdaterHandlers({
      autoUpdater,
      clearAvailableUpdateContext: this.clearAvailableUpdateContext,
      consumeMissingManifestPrereleaseFallbackResult:
        this.consumeMissingManifestPrereleaseFallbackResult,
      getMissingManifestPrereleaseFallbackUserInitiated:
        this.getMissingManifestPrereleaseFallbackUserInitiated,
      getPublishingWindowLastGoodCheck: this.getPublishingWindowLastGoodCheck,
      getActiveUpdateCheckEventAttemptId: this.getActiveUpdateCheckEventAttemptId,
      getCurrentStatus: () => this.currentStatus,
      getKnownReleaseUrl: this.getKnownReleaseUrl,
      getPendingInstallVersion: this.getPendingInstallVersion,
      getUserInitiatedCheck: () => this.userInitiatedCheck,
      handleQuitAndInstallFailure: this.handleQuitAndInstallFailure,
      isQuitAndInstallHandoffActive: this.isQuitAndInstallHandoffActive,
      hasNewerDownloadedVersion: this.hasNewerDownloadedVersion,
      shouldHandleUpdaterErrorEvent: this.shouldHandleUpdaterErrorEvent,
      performQuitAndInstall: this.performQuitAndInstall,
      clearUpdateAvailableEventPending: this.clearUpdateAvailableEventPending,
      isActiveUpdateCheckAttempt: this.isActiveUpdateCheckAttempt,
      markUpdateCheckEventAttempt: this.markUpdateCheckEventAttempt,
      markUpdateAvailableEventPending: this.markUpdateAvailableEventPending,
      sendCheckFailureStatus: this.sendCheckFailureStatus,
      sendErrorStatus: this.sendErrorStatus,
      markMissingManifestPrereleaseFallbackChecking:
        this.markMissingManifestPrereleaseFallbackChecking,
      shouldSuppressMissingManifestPrereleaseFallbackEvent:
        this.shouldSuppressMissingManifestPrereleaseFallbackEvent,
      suppressMissingManifestPrereleaseFallbackPromiseFailure:
        this.suppressMissingManifestPrereleaseFallbackPromiseFailure,
      recordCompletedUpdateCheck: this.recordCompletedUpdateCheck,
      sendStatus: this.sendStatus,
      scheduleAutomaticUpdateCheck: this.scheduleAutomaticUpdateCheck,
      clearBackgroundCheckLaunchPending: this.clearBackgroundCheckLaunchPending,
      setAvailableReleaseUrl: (releaseUrl) => {
        this.availableReleaseUrl = releaseUrl
      },
      setAvailableVersion: (version) => {
        this.availableVersion = version
      },
      setUserInitiatedCheck: (value) => {
        this.userInitiatedCheck = value
      }
    })

    const checkForDueUpdate = () => {
      if (
        this.backgroundCheckLaunchPending ||
        this.currentStatus.state === 'checking' ||
        this.currentStatus.state === 'downloading'
      ) {
        return
      }
      const lastCheck = this._getLastUpdateCheckAt?.() ?? null
      const msSince = lastCheck === null ? Number.POSITIVE_INFINITY : Date.now() - lastCheck
      if (msSince >= AUTO_UPDATE_CHECK_INTERVAL_MS) {
        this.runBackgroundUpdateCheck()
        this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
      }
    }

    powerMonitor.on('resume', checkForDueUpdate)
    app.on('browser-window-focus', checkForDueUpdate)

    const lastUpdateCheckAt = opts?.getLastUpdateCheckAt?.() ?? null
    const msSinceLastCheck =
      lastUpdateCheckAt === null ? Number.POSITIVE_INFINITY : Date.now() - lastUpdateCheckAt

    if (msSinceLastCheck >= AUTO_UPDATE_CHECK_INTERVAL_MS) {
      this.runBackgroundUpdateCheck()
      this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
    } else {
      this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS - msSinceLastCheck)
    }
  }

  downloadUpdate = (): void => {
    if (this.downloadInFlight) {
      return
    }
    // Why: permit retry from 'error' when we still have a cached availableVersion —
    // a failed download leaves the status at 'error' but availableVersion intact,
    // and the error card's "Retry Download" button must be able to restart the
    // download. Without this, the button would appear to do nothing.
    const canStart =
      this.currentStatus.state === 'available' ||
      (this.currentStatus.state === 'error' && this.hasNewerDownloadedVersion())
    if (!canStart) {
      return
    }
    this.downloadInFlight = true
    beginMacUpdateDownload()
    this.getAutoUpdater()
      .downloadUpdate()
      .catch((err) => {
        this.downloadInFlight = false
        this.sendErrorStatus(String(err?.message ?? err))
      })
  }
}
