export type CheckFailureSource = 'event' | 'promise' | 'fallback-promise'
export type MissingManifestPrereleaseFallbackResult = { userInitiated: boolean }
export type PrimaryEventSuppression = { failureKey: string; error: unknown }
export type UpdateCheckVariant = 'default' | 'prerelease' | 'perf'
export type ReleaseFeedPreflightResult = 'ready' | 'not-available'

export const AUTO_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
export const AUTO_UPDATE_RETRY_INTERVAL_MS = 60 * 60 * 1000
// Why: a persistently-failing feed (blocked domain, proxy, GHE mirror) used
// to re-arm the retry at an exact 1h cadence forever — the recurring hourly
// macOS Performance Diagnostics signature in issue #7576. Double the retry
// delay per consecutive failure up to this cap; any completed check resets.
// Release-publishing windows resolve within the first (still 1h) retry.
export const MAX_AUTO_UPDATE_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000
export const QUIT_AND_INSTALL_DELAY_MS = 100
export const PRE_QUIT_CLEANUP_TIMEOUT_MS = 2_500
export const UPDATE_CHECK_SILENT_SETTLE_DELAY_MS = 1_000
export const UPDATE_CHECK_STALL_TIMEOUT_MS = 45_000

export type UpdaterStatusTarget = { webContents: { id?: number } }
