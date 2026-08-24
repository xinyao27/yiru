import { YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL } from '@yiru/workbench-model/product'
import { app } from 'electron'

import { isMissingUpdateManifestFailure, isPrereleaseVersion } from '../updater-fallback'
import {
  fetchNewerReleaseTagsWithReadiness,
  getReleaseDownloadUrl
} from '../updater-prerelease-feed'
import type { CheckFailureSource, UpdateCheckVariant, ReleaseFeedPreflightResult } from './model'
import { UpdaterScheduling } from './scheduling'

export abstract class UpdaterReleaseFeed extends UpdaterScheduling {
  pinDefaultReleaseFeed = async (
    variant: UpdateCheckVariant = 'default'
  ): Promise<ReleaseFeedPreflightResult> => {
    const autoUpdater = this.getAutoUpdater()
    // Why: the /releases/latest/download/ redirect can move between the update
    // check and the later manual download click. Pinning to the concrete tag
    // keeps the manifest and ZIP asset on the same release.
    //
    // Prerelease users still need any-channel resolution so they can move to a
    // newer RC or the next stable. Stable users should only resolve stable tags.
    const currentVersion = app.getVersion()
    const isPerfCheck = variant === 'perf'
    const includePrerelease =
      isPerfCheck || this.includePrereleaseActive || isPrereleaseVersion(currentVersion)
    const releaseTagsResult = await fetchNewerReleaseTagsWithReadiness(
      currentVersion,
      includePrerelease ? 2 : 1,
      {
        includePrerelease,
        ...(isPerfCheck ? { releaseFilter: 'perf' as const } : {})
      }
    )
    const newerTag = releaseTagsResult.tags[0] ?? null
    const fallbackTag = includePrerelease ? (releaseTagsResult.tags[1] ?? null) : null
    this.pendingPrereleaseFallback =
      includePrerelease && newerTag && fallbackTag
        ? {
            primaryTag: newerTag,
            fallbackTag,
            userInitiated: false,
            suppressedPrimaryPromiseFailureKey: null,
            suppressedPrimaryEventFailure: null,
            suppressedFallbackPromiseFailureKey: null,
            suppressedFallbackEventFailureKey: null,
            fallbackResultHandled: false,
            fallbackCheckingForUpdateSeen: false,
            retryLaunched: false
          }
        : null
    // Why: console.info goes to stdout and is captured by Console.app on macOS
    // and by --enable-logging elsewhere. This is the only window we have into
    // the updater on a user's machine when something goes wrong. Cheap to keep,
    // invaluable when triaging.
    if (newerTag) {
      this.clearPublishingWindowLastGoodCheck()
      const url = getReleaseDownloadUrl(newerTag)
      console.info(
        `[updater] release feed pinned: current=${currentVersion} includePrerelease=${includePrerelease} → ${url}`
      )
      autoUpdater.setFeedURL({ provider: 'generic', url })
      return 'ready'
    } else if (releaseTagsResult.state === 'not-ready') {
      this.clearPrereleaseFallbackContext()
      if (releaseTagsResult.lastGoodTag) {
        // Why: during a publish window the newest tag is unsafe, but a verified
        // last-good concrete feed lets electron-updater emit a real result.
        const url = getReleaseDownloadUrl(releaseTagsResult.lastGoodTag)
        console.info(
          `[updater] release feed pinned to last-good: current=${currentVersion} includePrerelease=${includePrerelease} → ${url}`
        )
        this.publishingWindowLastGoodCheck = { lastGoodTag: releaseTagsResult.lastGoodTag }
        autoUpdater.setFeedURL({ provider: 'generic', url })
        return 'ready'
      }
      this.clearPublishingWindowLastGoodCheck()
      console.info(
        `[updater] release feed deferred: current=${currentVersion} includePrerelease=${includePrerelease}; newest release assets are still publishing`
      )
      throw new Error('Latest release assets are still publishing')
    } else if (isPerfCheck) {
      this.clearPrereleaseFallbackContext()
      this.clearPublishingWindowLastGoodCheck()
      if (releaseTagsResult.state === 'no-newer') {
        console.info(
          `[updater] perf release not found: current=${currentVersion} includePrerelease=${includePrerelease}`
        )
        return 'not-available'
      }
      throw new Error('Could not resolve perf update feed')
    } else {
      this.clearPrereleaseFallbackContext()
      this.clearPublishingWindowLastGoodCheck()
      const url = YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL
      console.info(
        `[updater] release feed fallback: current=${currentVersion} includePrerelease=${includePrerelease} → ${url}`
      )
      autoUpdater.setFeedURL({ provider: 'generic', url })
      return 'ready'
    }
  }

  retryPrereleaseFallbackAfterMissingManifest = (
    message: string,
    userInitiated: boolean | undefined,
    source: CheckFailureSource,
    failureKey: string,
    sourceError?: unknown
  ): boolean => {
    if (
      !this.pendingPrereleaseFallback ||
      this.pendingPrereleaseFallback.retryLaunched ||
      !isMissingUpdateManifestFailure(message)
    ) {
      return false
    }
    const attemptId = this.activeUpdateCheckAttemptId
    if (attemptId === null) {
      return false
    }

    // Why: a published tag can briefly point at a missing platform manifest
    // during GitHub release transitions. Walk back once to the previous feed
    // entry so users on the last good build see a normal not-available result.
    this.pendingPrereleaseFallback.retryLaunched = true
    this.pendingPrereleaseFallback.userInitiated = Boolean(userInitiated)
    this.pendingPrereleaseFallback.suppressedPrimaryPromiseFailureKey =
      source === 'event' ? failureKey : null
    this.pendingPrereleaseFallback.suppressedPrimaryEventFailure =
      source === 'promise' ? { failureKey, error: sourceError } : null
    this.pendingPrereleaseFallback.fallbackCheckingForUpdateSeen = false
    const { primaryTag, fallbackTag } = this.pendingPrereleaseFallback
    const url = getReleaseDownloadUrl(fallbackTag)
    console.info(
      `[updater] prerelease manifest missing for ${primaryTag}; retrying once against ${url}`
    )
    const autoUpdater = this.getAutoUpdater()
    autoUpdater.setFeedURL({ provider: 'generic', url })
    this.userInitiatedCheck = Boolean(userInitiated)
    this.backgroundCheckLaunchPending = !userInitiated
    this.armUpdateCheckStallTimer(attemptId)
    this.markUpdateCheckLaunched(attemptId)
    void autoUpdater
      .checkForUpdates()
      .then(() => this.handleSettledUpdateCheckPromise(attemptId))
      .catch((err) => {
        if (!this.isActiveUpdateCheckAttempt(attemptId)) {
          return
        }
        const message = String(err?.message ?? err)
        if (userInitiated) {
          this.userInitiatedCheck = false
        } else {
          this.backgroundCheckLaunchPending = false
        }
        this.markMissingManifestPrereleaseFallbackPromiseHandled(message)
        this.consumeMissingManifestPrereleaseFallbackResult()
        void this.sendCheckFailureStatus(message, userInitiated, 'fallback-promise', err)
      })
    return true
  }
}
