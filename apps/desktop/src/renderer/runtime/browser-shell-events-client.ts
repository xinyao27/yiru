import type { BrowserApi } from '~preload/api-types'

type BrowserShellEventApi = Pick<
  BrowserApi,
  | 'onActivateView'
  | 'onCertificateFailureChanged'
  | 'onContextMenuDismissed'
  | 'onContextMenuRequested'
  | 'onDownloadFinished'
  | 'onDownloadProgress'
  | 'onDownloadRequested'
  | 'onGrabActionShortcut'
  | 'onGrabModeToggle'
  | 'onGuestLoadFailed'
  | 'onNavigationUpdate'
  | 'onOpenLinkInYiruTab'
  | 'onPaneFocus'
  | 'onPermissionDenied'
  | 'onPopup'
>

// Why: these are Electron shell/UI events rather than host capability calls.
// Keeping the adapter here leaves renderer features dependent on one runtime seam.
export const browserShellEventsClient: BrowserShellEventApi = {
  onActivateView: (callback) => window.api.browser.onActivateView(callback),
  onCertificateFailureChanged: (callback) =>
    window.api.browser.onCertificateFailureChanged(callback),
  onContextMenuDismissed: (callback) => window.api.browser.onContextMenuDismissed(callback),
  onContextMenuRequested: (callback) => window.api.browser.onContextMenuRequested(callback),
  onDownloadFinished: (callback) => window.api.browser.onDownloadFinished(callback),
  onDownloadProgress: (callback) => window.api.browser.onDownloadProgress(callback),
  onDownloadRequested: (callback) => window.api.browser.onDownloadRequested(callback),
  onGrabActionShortcut: (callback) => window.api.browser.onGrabActionShortcut(callback),
  onGrabModeToggle: (callback) => window.api.browser.onGrabModeToggle(callback),
  onGuestLoadFailed: (callback) => window.api.browser.onGuestLoadFailed(callback),
  onNavigationUpdate: (callback) => window.api.browser.onNavigationUpdate(callback),
  onOpenLinkInYiruTab: (callback) => window.api.browser.onOpenLinkInYiruTab(callback),
  onPaneFocus: (callback) => window.api.browser.onPaneFocus(callback),
  onPermissionDenied: (callback) => window.api.browser.onPermissionDenied(callback),
  onPopup: (callback) => window.api.browser.onPopup(callback)
}
