import type { BrowserCertificateFailure, BrowserLoadError } from './session-result.js'

// Host-observable browser events. These are the browser signals Chrome and iOS
// clients need, unlike local pane focus and view activation.
// Origins are sanitized to origin/host upstream so auth query params never leak
// into client UI state.

export type BrowserPermissionDeniedEvent = {
  browserPageId: string
  /** Browser permission name (e.g. "media", "notifications"). */
  permission: string
  origin: string
}

export type BrowserPopupEvent = {
  browserPageId: string
  origin: string
  /** Whether Yiru opened the target in Yiru, opened it externally, or blocked it as unsafe. */
  action: 'opened-in-yiru' | 'opened-external' | 'blocked'
}

export type BrowserDownloadRequestedEvent = {
  browserPageId: string
  downloadId: string
  origin: string
  filename: string
  totalBytes: number | null
  mimeType: string | null
  savePath: string
  status: 'downloading'
}

export type BrowserDownloadProgressEvent = {
  browserPageId?: string
  downloadId: string
  receivedBytes: number
  totalBytes: number | null
  state: 'progressing' | 'interrupted' | null
}

export type BrowserDownloadFinishedEvent = {
  browserPageId?: string
  downloadId: string
  status: 'completed' | 'canceled' | 'failed'
  /** Human-readable UI copy only; must never contain secrets. */
  error: string | null
  savePath: string | null
}

export type BrowserNavigationUpdateEvent = {
  browserPageId: string
  url: string
  title: string
  /** Live Chromium history affordances after a CDP-driven navigation. */
  canGoBack?: boolean
  canGoForward?: boolean
}

export type BrowserGuestLoadFailedEvent = {
  browserPageId: string
  loadError: BrowserLoadError
}

export type BrowserCertificateFailureChangedEvent = {
  browserPageId: string
  failure: BrowserCertificateFailure | null
}

export type BrowserOpenLinkInYiruTabEvent = {
  browserPageId: string
  url: string
}

export type RuntimeBrowserGuestEvent =
  | ({ type: 'permissionDenied' } & BrowserPermissionDeniedEvent)
  | ({ type: 'popup' } & BrowserPopupEvent)
  | ({ type: 'downloadRequested' } & BrowserDownloadRequestedEvent)
  | ({ type: 'downloadProgress' } & BrowserDownloadProgressEvent)
  | ({ type: 'downloadFinished' } & BrowserDownloadFinishedEvent)
  | ({ type: 'navigationUpdate' } & BrowserNavigationUpdateEvent)
  | ({ type: 'guestLoadFailed' } & BrowserGuestLoadFailedEvent)
  | ({ type: 'certificateFailureChanged' } & BrowserCertificateFailureChangedEvent)
  | ({ type: 'openLinkInYiruTab' } & BrowserOpenLinkInYiruTabEvent)

export type RuntimeBrowserGuestSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeBrowserGuestEvent
  | { type: 'end' }
