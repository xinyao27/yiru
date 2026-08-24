import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import type { UpdateCheckOptions } from '~shared/types'

import { withUpdaterSpan } from '../observability/instrumentation'
import { deferMacQuitUntilInstallerReady } from '../updater-mac-install'
import { QUIT_AND_INSTALL_DELAY_MS } from './model'
import { UpdaterReleaseFeed } from './release-feed'

export abstract class UpdaterChecks extends UpdaterReleaseFeed {
  runBackgroundUpdateCheck = (
    nudgeId: string | null = this.getPersistedPendingUpdateNudgeId()
  ): void => {
    if (this.backgroundCheckLaunchPending || this.currentStatus.state === 'checking') {
      return
    }
    if (!app.isPackaged || is.dev) {
      this.sendStatus({ state: 'not-available' })
      return
    }
    // Why: scope the nudge marker to the updater cycle being launched right now.
    // Setting it here, before any updater events or rejected promises can arrive,
    // prevents later ordinary checks from inheriting an older campaign id. Use
    // the persisted pending id for ordinary background checks so a nudge-driven
    // card can still be dismissed correctly after relaunch or a later automatic check.
    this.activeUpdateNudgeId = nudgeId
    // Why: autoUpdater.checkForUpdates() is async and 'checking-for-update'
    // arrives on a later tick, so a second focus/resume event can slip in before
    // currentStatus flips to 'checking'. Track the launch in memory to dedupe
    // that gap without persisting a successful-check timestamp before the result.
    this.backgroundCheckLaunchPending = true
    this.backgroundCheckPromotedToUserInitiated = false
    const attemptId = this.beginUpdateCheckAttempt()
    // Don't send 'checking' here — the 'checking-for-update' event handler does it,
    // and sending it from both places causes duplicate notifications (issue #35).
    const autoUpdater = this.getAutoUpdater()
    const launch = (): Promise<unknown> | undefined => {
      if (!this.isActiveUpdateCheckAttempt(attemptId)) {
        return undefined
      }
      this.markUpdateCheckLaunched(attemptId)
      return autoUpdater.checkForUpdates()
    }
    const run = this.pinDefaultReleaseFeed().then(launch)
    void Promise.resolve(run)
      .then(() => this.handleSettledUpdateCheckPromise(attemptId))
      .catch((err) => {
        if (!this.isActiveUpdateCheckAttempt(attemptId)) {
          return
        }
        const wasUserInitiated = this.getSettledCheckUserInitiated()
        this.backgroundCheckLaunchPending = false
        this.backgroundCheckPromotedToUserInitiated = false
        if (wasUserInitiated) {
          this.userInitiatedCheck = false
        }
        void this.sendCheckFailureStatus(
          String(err?.message ?? err),
          wasUserInitiated,
          'promise',
          err
        )
      })
  }

  checkForUpdates = (): void => {
    // Fire-and-forget the span so the public function signature stays
    // synchronous (callers do not await this). The span ALWAYS records
    // Success — it captures only the launch of the check, not its outcome.
    // The actual check runs through autoUpdater event handlers; failure is
    // surfaced via sendCheckFailureStatus on a separate code path.
    // Dashboards: do not group on this span's outcome attribute — the
    // success rate here reflects launch dispatch, not check success, and
    // will read ~100% by construction. Instead, filter on
    // `updater.outcome === 'launched'` to count check-launch dispatches; the
    // attribute makes the always-success semantics explicit and queryable
    // (so a dashboard tile can't accidentally treat this span's success rate
    // as the actual update-check success rate).
    void withUpdaterSpan({ stage: 'check' }, async (span) => {
      span.setAttribute('updater.outcome', 'launched')
      this.runBackgroundUpdateCheck()
    })
  }

  enablePrereleaseManifestChecks = (): void => {
    this.getAutoUpdater().allowPrerelease = true
  }

  enableIncludePrerelease = (): void => {
    if (this.includePrereleaseActive) {
      return
    }
    // Why: generic-provider checks still need this flag so electron-updater will
    // accept a prerelease manifest for users who intentionally Shift-clicked.
    // We keep using the manifest-probed generic feed instead of the native
    // GitHub provider because cancelled RC releases can appear without assets.
    this.enablePrereleaseManifestChecks()
    this.includePrereleaseActive = true
  }

  checkForUpdatesFromMenu = (options?: UpdateCheckOptions): void => {
    if (!app.isPackaged || is.dev) {
      this.sendStatus({ state: 'not-available', userInitiated: true })
      return
    }

    const checkVariant = this.getUpdateCheckVariant(options)
    if (checkVariant === 'prerelease') {
      this.clearPrereleaseFallbackContext()
      this.enableIncludePrerelease()
    } else if (checkVariant === 'perf') {
      this.clearPrereleaseFallbackContext()
      // Why: perf checks need prerelease manifests for this check, but must not
      // opt future default/background checks into the RC channel.
      this.enablePrereleaseManifestChecks()
    }

    const checkAlreadyInFlight =
      this.backgroundCheckLaunchPending || this.currentStatus.state === 'checking'
    this.userInitiatedCheck = true
    // Why: a manual check is independent of any active nudge campaign. Reset the
    // nudge marker so the resulting status is not decorated with activeNudgeId,
    // which would cause a later dismiss to consume the campaign by accident.
    this.activeUpdateNudgeId = null
    // Why: manual checks should visibly respond before feed pinning or the
    // electron-updater event fires; duplicate event broadcasts are suppressed by
    // status equality below.
    this.sendStatus({ state: 'checking', userInitiated: true })
    if (checkAlreadyInFlight) {
      this.backgroundCheckPromotedToUserInitiated = true
      this.rearmActiveUpdateCheckStallTimer()
      if (checkVariant !== 'default') {
        // Why: the in-flight check may have already pinned the stable feed. Queue
        // a fresh modifier check so it doesn't inherit a stale-channel result.
        this.pendingUserInitiatedCheckAfterInFlight = checkVariant
      }
      return
    }

    const attemptId = this.beginUpdateCheckAttempt()
    const autoUpdater = this.getAutoUpdater()
    const launch = (): Promise<unknown> | undefined => {
      if (!this.isActiveUpdateCheckAttempt(attemptId)) {
        return undefined
      }
      this.markUpdateCheckLaunched(attemptId)
      return autoUpdater.checkForUpdates()
    }
    const run = this.pinDefaultReleaseFeed(checkVariant).then((preflightResult) => {
      if (preflightResult === 'not-available') {
        if (!this.isActiveUpdateCheckAttempt(attemptId)) {
          return false
        }
        this.userInitiatedCheck = false
        this.finishActiveUpdateCheckAttempt()
        this.recordCompletedUpdateCheck()
        this.sendStatus({ state: 'not-available', userInitiated: true })
        return false
      }
      return launch()
    })
    void Promise.resolve(run)
      .then((launchResult) => {
        if (launchResult === false) {
          return
        }
        this.handleSettledUpdateCheckPromise(attemptId)
      })
      .catch((err) => {
        if (!this.isActiveUpdateCheckAttempt(attemptId)) {
          return
        }
        this.userInitiatedCheck = false
        void this.sendCheckFailureStatus(String(err?.message ?? err), true, 'promise', err)
      })
  }

  isQuittingForUpdate = (): boolean => {
    return this.quittingForUpdate
  }

  quitAndInstall = (): void => {
    if (this.pendingQuitAndInstallTimer || this.quitAndInstallInProgress) {
      return
    }

    if (
      deferMacQuitUntilInstallerReady(
        this.currentStatus,
        this.hasNewerDownloadedVersion(),
        this.getPendingInstallVersion,
        this.sendStatus
      )
    ) {
      return
    }

    // Why: every renderer entrypoint reaches this IPC handler from an in-flight
    // click or toast callback. Deferring the actual quit here gives the renderer
    // a moment to flush dismissals/state updates before windows start closing,
    // and centralizing it avoids drift between the toast flow and settings UI.
    this.pendingQuitAndInstallTimer = setTimeout(() => {
      void this.performQuitAndInstall()
    }, QUIT_AND_INSTALL_DELAY_MS)
  }

  dismissNudge = (): void => {
    const pendingId = this.activeUpdateNudgeId ?? this._getPendingUpdateNudgeId?.() ?? null
    if (pendingId) {
      this._setDismissedUpdateNudgeId?.(pendingId)
      this.clearPendingUpdateNudge()
    }
  }
}
