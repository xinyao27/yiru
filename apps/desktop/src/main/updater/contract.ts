import type {
  RemoteServerUpdateInstallMode,
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '~shared/remote-server-update'
import type { UpdateCheckOptions, UpdateStatus } from '~shared/types'

import type { ElectronAutoUpdater } from '../electron-updater-loader'
import type {
  CheckFailureSource,
  MissingManifestPrereleaseFallbackResult,
  PrimaryEventSuppression,
  UpdateCheckVariant,
  ReleaseFeedPreflightResult,
  UpdaterStatusTarget
} from './model'

export abstract class UpdaterContract {
  protected consecutiveAutomaticRetrySchedules = 0
  protected mainWindowRef: UpdaterStatusTarget | null = null
  protected currentStatus: UpdateStatus = { state: 'idle' }
  protected userInitiatedCheck = false
  protected onBeforeQuitCleanup: (() => void | Promise<void>) | null = null
  protected autoUpdaterInitialized = false
  protected remoteServerUpdateInstallMode: RemoteServerUpdateInstallMode = 'interactive'
  // Why: modifier-clicking "Check for Updates" can target prerelease manifests.
  // The generic feed still gets pinned to a concrete tag on every check so
  // cancelled prereleases without manifests are skipped.
  protected includePrereleaseActive = false
  protected availableVersion: string | null = null
  protected availableReleaseUrl: string | null = null
  protected pendingCheckFailureKey: string | null = null
  protected pendingCheckFailurePromise: Promise<void> | null = null
  protected autoUpdateCheckTimer: ReturnType<typeof setTimeout> | null = null
  protected pendingQuitAndInstallTimer: ReturnType<typeof setTimeout> | null = null
  protected quitAndInstallInProgress = false
  // Why: once quitAndInstall has committed (Win/Linux install, or macOS with
  // Squirrel ready), late autoUpdater 'error' events must not clear
  // quittingForUpdate — that would re-enable dock activate mid-installer.
  protected updateInstallCommitted = false
  // Why: quit-and-install recovery must only run after the native
  // quitAndInstall call. Pre-native cleanup-time autoUpdater errors must not
  // clear quittingForUpdate or look like install recovery.
  protected quitAndInstallNativeInvoked = false
  protected persistLastUpdateCheckAt: ((timestamp: number) => void) | null = null
  protected _getLastUpdateCheckAt: (() => number | null) | null = null
  protected backgroundCheckLaunchPending = false
  // Why: a manually promoted background check can emit an error event before the
  // paired promise catch runs; keep the promotion attached to that launch.
  protected backgroundCheckPromotedToUserInitiated = false
  protected updateCheckStallTimer: ReturnType<typeof setTimeout> | null = null
  protected updateCheckSilentSettleTimer: ReturnType<typeof setTimeout> | null = null
  protected updateCheckAttemptSequence = 0
  protected activeUpdateCheckAttemptId: number | null = null
  protected activeUpdateCheckLaunchAttemptId: number | null = null
  protected activeUpdateCheckEventAttemptId: number | null = null
  protected updateAvailableEventPendingAttemptId: number | null = null
  protected pendingUserInitiatedCheckAfterInFlight: UpdateCheckVariant | null = null
  protected activeUpdateNudgeId: string | null = null
  protected awaitingNudgeCheckOutcome = false
  protected publishingWindowLastGoodCheck: { lastGoodTag: string } | null = null
  protected pendingPrereleaseFallback: {
    primaryTag: string
    fallbackTag: string
    // Why: the primary promise cleanup can run after fallback starts; fallback
    // events need the attempt-scoped initiation state, not the mutable global.
    userInitiated: boolean
    suppressedPrimaryPromiseFailureKey: string | null
    suppressedPrimaryEventFailure: PrimaryEventSuppression | null
    suppressedFallbackPromiseFailureKey: string | null
    suppressedFallbackEventFailureKey: string | null
    fallbackResultHandled: boolean
    fallbackCheckingForUpdateSeen: boolean
    retryLaunched: boolean
  } | null = null

  protected _getPendingUpdateNudgeId: (() => string | null) | null = null
  protected _setPendingUpdateNudgeId: ((id: string | null) => void) | null = null
  protected _setDismissedUpdateNudgeId: ((id: string | null) => void) | null = null
  // Why: guards against duplicate download() calls when both the card and
  // Settings trigger a download before the first download-progress event
  // flips the status to 'downloading'.
  protected downloadInFlight = false
  /** Guards against the macOS `activate` handler re-opening the old version
   *  while Squirrel's ShipIt is replacing the .app bundle. */
  protected quittingForUpdate = false
  protected autoUpdater: ElectronAutoUpdater | null = null

  abstract getAutoUpdater(): ElectronAutoUpdater

  abstract clearAvailableUpdateContext(): void

  abstract clearPrereleaseFallbackContext(): void

  abstract clearPendingUpdateNudge(): void

  abstract deferPendingUpdateNudgeUntilRetry(): void

  abstract clearPublishingWindowLastGoodCheck(): void

  abstract getPublishingWindowLastGoodCheck(): { lastGoodTag: string } | null

  abstract getPersistedPendingUpdateNudgeId(): string | null

  abstract decorateStatusWithActiveNudge(status: UpdateStatus): UpdateStatus

  abstract sendStatus(status: UpdateStatus): void

  abstract getOptionsForUpdateCheckVariant(variant: UpdateCheckVariant): UpdateCheckOptions

  abstract getUpdateCheckVariant(options?: UpdateCheckOptions): UpdateCheckVariant

  abstract launchPendingUserInitiatedCheckAfterInFlight(variant: UpdateCheckVariant): void

  abstract clearBackgroundCheckLaunchPending(): void

  abstract clearUpdateCheckStallTimer(): void

  abstract clearUpdateCheckSilentSettleTimer(): void

  abstract clearUpdateCheckTimers(): void

  abstract finishActiveUpdateCheckAttempt(): void

  abstract getActiveUpdateCheckEventAttemptId(): number | null

  abstract isActiveUpdateCheckAttempt(attemptId: number): boolean

  abstract markUpdateCheckEventAttempt(): boolean

  abstract markUpdateCheckLaunched(attemptId: number): void

  abstract markUpdateAvailableEventPending(attemptId: number | null): void

  abstract clearUpdateAvailableEventPending(attemptId: number | null): void

  abstract armUpdateCheckStallTimer(attemptId: number): void

  abstract beginUpdateCheckAttempt(): number

  abstract rearmActiveUpdateCheckStallTimer(): void

  abstract getSettledCheckUserInitiated(): boolean | undefined

  abstract isUpdateCheckResultState(state: UpdateStatus['state']): boolean

  abstract consumeSilentCheckShortRetryReason(): boolean

  abstract completeSilentUpdateCheck(userInitiated: boolean | undefined): boolean

  abstract settleSilentUpdateCheck(attemptId: number, userInitiated: boolean | undefined): void

  abstract handleSettledUpdateCheckPromise(attemptId: number): void

  abstract shouldHandleUpdaterErrorEvent(): boolean

  abstract sendErrorStatus(message: string, userInitiated?: boolean): void

  abstract getKnownReleaseUrl(): string | undefined

  abstract hasNewerDownloadedVersion(): boolean

  abstract getPendingInstallVersion(): string

  abstract getCheckFailureKey(message: string, userInitiated?: boolean): string

  abstract resolveUpdateInstallMode(isServeMode: boolean): RemoteServerUpdateInstallMode

  abstract clearPrereleaseFallbackContextIfSettled(): void

  abstract performQuitAndInstall(): Promise<void>

  abstract resetQuitForUpdateState(): void

  abstract handleQuitAndInstallFailure(): boolean

  abstract isQuitAndInstallHandoffActive(): boolean

  abstract runBeforeUpdateQuitCleanup(): Promise<void>

  abstract sendCheckFailureStatus(
    message: string,
    userInitiated?: boolean,
    source?: CheckFailureSource,
    sourceError?: unknown
  ): Promise<void>

  abstract getUpdateStatus(): UpdateStatus

  abstract configureRemoteServerUpdateInstallMode(installMode: RemoteServerUpdateInstallMode): void

  abstract getRemoteServerUpdateSupport(): RemoteServerUpdateSupport

  abstract getRemoteServerUpdaterSnapshot(runtimeId: string): RemoteServerUpdaterSnapshot

  abstract assertRemoteServerUpdateAvailable(): void

  abstract checkForRemoteServerUpdate(
    runtimeId: string,
    options?: UpdateCheckOptions
  ): RemoteServerUpdaterSnapshot

  abstract downloadRemoteServerUpdate(runtimeId: string): RemoteServerUpdaterSnapshot

  abstract installRemoteServerUpdate(runtimeId: string): RemoteServerUpdateInstallResult

  abstract scheduleAutomaticUpdateCheck(delayMs: number): void

  abstract recordCompletedUpdateCheck(): void

  abstract getMissingManifestPrereleaseFallbackUserInitiated(): boolean | null

  abstract markMissingManifestPrereleaseFallbackChecking(): void

  abstract consumeMissingManifestPrereleaseFallbackResult(): MissingManifestPrereleaseFallbackResult | null

  abstract suppressMissingManifestPrereleaseFallbackPromiseFailure(message: string): void

  abstract shouldSuppressMissingManifestPrereleaseFallbackEvent(
    message: string,
    error: unknown
  ): boolean

  abstract markMissingManifestPrereleaseFallbackPromiseHandled(message: string): void

  abstract pinDefaultReleaseFeed(variant?: UpdateCheckVariant): Promise<ReleaseFeedPreflightResult>

  abstract retryPrereleaseFallbackAfterMissingManifest(
    message: string,
    userInitiated: boolean | undefined,
    source: CheckFailureSource,
    failureKey: string,
    sourceError?: unknown
  ): boolean

  abstract runBackgroundUpdateCheck(nudgeId?: string | null): void

  abstract checkForUpdates(): void

  abstract enablePrereleaseManifestChecks(): void

  abstract enableIncludePrerelease(): void

  abstract checkForUpdatesFromMenu(options?: UpdateCheckOptions): void

  abstract isQuittingForUpdate(): boolean

  abstract quitAndInstall(): void

  abstract dismissNudge(): void

  abstract setupAutoUpdater(
    mainWindow: UpdaterStatusTarget,
    opts?: {
      getLastUpdateCheckAt?: () => number | null
      onBeforeQuit?: () => void | Promise<void>
      setLastUpdateCheckAt?: (timestamp: number) => void
      getPendingUpdateNudgeId?: () => string | null
      setPendingUpdateNudgeId?: (id: string | null) => void
      setDismissedUpdateNudgeId?: (id: string | null) => void
    }
  ): void

  abstract downloadUpdate(): void
}
