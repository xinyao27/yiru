import { BrowserWindow } from 'electron'

import { withUpdaterSpan } from '../observability/instrumentation'
import { killAllPty } from '../pty/pty'
import { failServeUpdateHandoff, requestServeUpdateHandoff } from '../serve-update-handoff'
import {
  armUpdateInstallExitWatchdog,
  disarmUpdateInstallExitWatchdog
} from '../update-install-exit-watchdog'
import { isBenignCheckFailure, isReleaseAssetsPublishingFailure } from '../updater-fallback'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'
import {
  isMacInstallerReady,
  markMacQuitAndInstallInFlight,
  resetMacInstallState
} from '../updater-mac-install'
import { UpdaterAttempts } from './attempts'
import type { CheckFailureSource } from './model'
import { AUTO_UPDATE_RETRY_INTERVAL_MS, PRE_QUIT_CLEANUP_TIMEOUT_MS } from './model'

export abstract class UpdaterInstallation extends UpdaterAttempts {
  performQuitAndInstall = async (): Promise<void> => {
    if (this.quitAndInstallInProgress) {
      recordUpdaterLifecycle('quit_and_install_ignored', { reason: 'already-in-progress' })
      return
    }
    this.quitAndInstallInProgress = true

    if (this.pendingQuitAndInstallTimer) {
      clearTimeout(this.pendingQuitAndInstallTimer)
      this.pendingQuitAndInstallTimer = null
    }

    markMacQuitAndInstallInFlight()

    // Set this BEFORE anything else so the `activate` handler in index.ts
    // won't re-open the old version while Squirrel's ShipIt is replacing
    // the .app bundle.  Without this guard the quit triggers window
    // destruction → BrowserWindow.getAllWindows().length === 0 → activate
    // fires → openMainWindow() resurrects the old process and ShipIt
    // either can't replace it or the user ends up on the old version.
    this.quittingForUpdate = true

    const pendingVersion = this.getPendingInstallVersion()
    try {
      await withUpdaterSpan({ stage: 'install' }, async (span) => {
        span.setAttribute('updater.version', pendingVersion || 'unknown')
        span.setAttribute('updater.platform', process.platform)
        span.setAttribute(
          'updater.macosInstallerReady',
          process.platform === 'darwin' ? isMacInstallerReady() : true
        )
        recordUpdaterLifecycle('quit_and_install_started', {
          version: pendingVersion || null,
          macInstallerReady: process.platform === 'darwin' ? isMacInstallerReady() : true
        })
        span.addEvent('pre_quit_cleanup_start')
        await this.runBeforeUpdateQuitCleanup()
        span.addEvent('pre_quit_cleanup_done')

        if (
          this.remoteServerUpdateInstallMode === 'supervised-headless-serve' &&
          !requestServeUpdateHandoff(pendingVersion)
        ) {
          this.sendErrorStatus(
            'Could not prepare the supervised server restart. Yiru remains running.',
            true
          )
          this.resetQuitForUpdateState()
          return
        }

        recordUpdaterLifecycle('quit_and_install_invoking_native', {
          version: pendingVersion || null
        })
        // Why: defensive — state should stay in-progress until native invoke, but
        // never call quitAndInstall if recovery/reset already cleared the handoff.
        if (!this.quitAndInstallInProgress) {
          return
        }
        // Why: mark before the call so a sync 'error' during quitAndInstall can
        // recover; pre-native errors must not look like install failure.
        this.quitAndInstallNativeInvoked = true
        // Why: invoke quitAndInstall before killAllPty/remove close listeners so a
        // sync 'error' (common "no filepath" path) recovers while windows and
        // local PTYs are still intact.
        const supervisorOwnsRelaunch =
          this.remoteServerUpdateInstallMode === 'supervised-headless-serve'
        this.getAutoUpdater().quitAndInstall(supervisorOwnsRelaunch, !supervisorOwnsRelaunch)
        span.addEvent('native_quit_and_install_invoked')

        // Why: handleQuitAndInstallFailure may clear quitAndInstallInProgress
        // synchronously during quitAndInstall (Win/Linux dispatchError). Skip
        // destructive prep if recovery already ran.
        if (!this.quitAndInstallInProgress) {
          return
        }

        killAllPty()
        span.addEvent('local_pty_kill_all')

        for (const win of BrowserWindow.getAllWindows()) {
          win.removeAllListeners('close')
        }
        span.addEvent('window_close_listeners_removed', {
          windowCount: BrowserWindow.getAllWindows().length
        })

        // Why: committed installs must keep quittingForUpdate true so dock
        // activate cannot reopen the old process mid-ShipIt/installer. macOS
        // without Squirrel ready stays uncommitted so late native errors can
        // still recover flags (PTYs may already be dead — residual OK).
        if (process.platform !== 'darwin' || isMacInstallerReady()) {
          this.updateInstallCommitted = true
          // Why: past this point recovery is forbidden and the installer waits
          // for this process to exit; a wedged async shutdown would otherwise
          // strand the user with no app and no update (#4438).
          armUpdateInstallExitWatchdog()
        }
      })
    } catch (error) {
      failServeUpdateHandoff('Could not invoke the native updater.')
      this.resetQuitForUpdateState()
      recordUpdaterLifecycle(
        'quit_and_install_failed',
        { errorType: error instanceof Error ? error.name : typeof error },
        {
          level: 'warn',
          message: 'Could not start update install'
        }
      )
      this.sendErrorStatus(
        'Could not restart to install the update. Quit and reopen Yiru, then try again.'
      )
    }
  }

  resetQuitForUpdateState = (): void => {
    this.quitAndInstallInProgress = false
    this.quittingForUpdate = false
    this.updateInstallCommitted = false
    this.quitAndInstallNativeInvoked = false
    disarmUpdateInstallExitWatchdog()
    resetMacInstallState()
  }

  handleQuitAndInstallFailure = (): boolean => {
    if (
      !this.quitAndInstallInProgress ||
      !this.quitAndInstallNativeInvoked ||
      this.updateInstallCommitted
    ) {
      return false
    }
    failServeUpdateHandoff('The native updater rejected the install request.')
    this.resetQuitForUpdateState()
    recordUpdaterLifecycle('quit_and_install_failed_via_event', undefined, {
      level: 'warn',
      message: 'Update install could not start; recovered app state'
    })
    this.sendErrorStatus(
      'Could not restart to install the update. Quit and reopen Yiru, then try again.'
    )
    return true
  }

  isQuitAndInstallHandoffActive = (): boolean => {
    return this.quitAndInstallInProgress
  }

  runBeforeUpdateQuitCleanup = async (): Promise<void> => {
    if (!this.onBeforeQuitCleanup) {
      return
    }

    let timeout: ReturnType<typeof setTimeout> | null = null
    const cleanup = Promise.resolve()
      .then(() => this.onBeforeQuitCleanup?.())
      .catch((error) => {
        recordUpdaterLifecycle(
          'pre_quit_cleanup_failed',
          { errorType: error instanceof Error ? error.name : typeof error },
          {
            level: 'warn',
            message: 'Pre-quit cleanup failed; continuing update install'
          }
        )
      })
    const timeoutResult = new Promise<'timeout'>((resolve) => {
      timeout = setTimeout(() => resolve('timeout'), PRE_QUIT_CLEANUP_TIMEOUT_MS)
    })

    const result = await Promise.race([cleanup.then(() => 'done' as const), timeoutResult])
    if (result === 'timeout') {
      recordUpdaterLifecycle(
        'pre_quit_cleanup_timeout',
        { timeoutMs: PRE_QUIT_CLEANUP_TIMEOUT_MS },
        {
          level: 'warn',
          message: `Pre-quit cleanup exceeded ${PRE_QUIT_CLEANUP_TIMEOUT_MS}ms; continuing update install`
        }
      )
      return
    }

    if (timeout) {
      clearTimeout(timeout)
    }
  }

  sendCheckFailureStatus = async (
    message: string,
    userInitiated?: boolean,
    source: CheckFailureSource = 'promise',
    sourceError?: unknown
  ): Promise<void> => {
    const failureKey = this.getCheckFailureKey(message, userInitiated)
    if (
      source === 'promise' &&
      this.pendingPrereleaseFallback?.suppressedPrimaryPromiseFailureKey === failureKey
    ) {
      this.pendingPrereleaseFallback.suppressedPrimaryPromiseFailureKey = null
      this.clearPrereleaseFallbackContextIfSettled()
      return
    }
    if (
      source === 'fallback-promise' &&
      this.pendingPrereleaseFallback?.suppressedFallbackPromiseFailureKey === failureKey
    ) {
      this.pendingPrereleaseFallback.suppressedFallbackPromiseFailureKey = null
      this.clearPrereleaseFallbackContextIfSettled()
      return
    }

    if (
      this.retryPrereleaseFallbackAfterMissingManifest(
        message,
        userInitiated,
        source,
        failureKey,
        sourceError
      )
    ) {
      return
    }

    if (this.pendingCheckFailureKey === failureKey && this.pendingCheckFailurePromise) {
      return this.pendingCheckFailurePromise
    }

    const handleFailure = async (): Promise<void> => {
      if (isBenignCheckFailure(message)) {
        // Why: release transition failures (missing latest.yml while a new
        // release is being published) and network blips are transient. Schedule
        // a background retry so the notification arrives once the release
        // finishes, and intentionally skip persistLastUpdateCheckAt — the check
        // didn't truly complete, and recording a timestamp would suppress the
        // next startup check.
        console.warn('[updater] benign check failure:', message)
        this.clearAvailableUpdateContext()
        this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)
        if (userInitiated) {
          // Why: a user-initiated click expects visible feedback — silently
          // dropping to 'idle' makes the button look broken. The card already
          // prefixes "Could not check for updates." and Settings prefixes
          // "Update check failed.", so the message here only carries the
          // actionable cause.
          this.sendErrorStatus(
            "Couldn't reach the update server. Try again in a few minutes.",
            true
          )
        } else {
          if (isReleaseAssetsPublishingFailure(message)) {
            // Why: a nudge-triggered check can land during the brief window where
            // GitHub exposes a release before its updater assets are reachable.
            // Keep the campaign pending so the short retry can still show it.
            this.deferPendingUpdateNudgeUntilRetry()
          }
          this.sendStatus({ state: 'idle' })
        }
        return
      }

      this.clearAvailableUpdateContext()
      this.persistLastUpdateCheckAt?.(Date.now())
      if (!userInitiated) {
        this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)
      }
      this.sendErrorStatus(message, userInitiated)
    }

    this.pendingCheckFailureKey = failureKey
    this.pendingCheckFailurePromise = handleFailure().finally(() => {
      if (this.pendingCheckFailureKey === failureKey) {
        this.pendingCheckFailureKey = null
        this.pendingCheckFailurePromise = null
      }
    })
    return this.pendingCheckFailurePromise
  }
}
