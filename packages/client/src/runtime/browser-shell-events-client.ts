import type {
  BrowserCertificateFailureChangedEvent,
  BrowserDownloadFinishedEvent,
  BrowserDownloadProgressEvent,
  BrowserDownloadRequestedEvent,
  BrowserGuestLoadFailedEvent,
  BrowserNavigationUpdateEvent,
  BrowserOpenLinkInYiruTabEvent,
  BrowserPermissionDeniedEvent,
  BrowserPopupEvent,
  RuntimeBrowserGuestSubscriptionEvent,
  ShellBrowserContextMenuRequestedEvent
} from '@yiru/runtime-protocol/contract'

import { callRuntimeOrpc } from './orpc-client'
import { subscribeShellEvent } from './shell-events-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'

type BrowserShellEventsClient = {
  onGuestLoadFailed: (callback: (event: BrowserGuestLoadFailedEvent) => void) => () => void
  onCertificateFailureChanged: (
    callback: (event: BrowserCertificateFailureChangedEvent) => void
  ) => () => void
  onPermissionDenied: (callback: (event: BrowserPermissionDeniedEvent) => void) => () => void
  onPopup: (callback: (event: BrowserPopupEvent) => void) => () => void
  onDownloadRequested: (callback: (event: BrowserDownloadRequestedEvent) => void) => () => void
  onDownloadProgress: (callback: (event: BrowserDownloadProgressEvent) => void) => () => void
  onDownloadFinished: (callback: (event: BrowserDownloadFinishedEvent) => void) => () => void
  onNavigationUpdate: (callback: (event: BrowserNavigationUpdateEvent) => void) => () => void
  onOpenLinkInYiruTab: (callback: (event: BrowserOpenLinkInYiruTabEvent) => void) => () => void
  onContextMenuRequested: (
    callback: (event: Omit<ShellBrowserContextMenuRequestedEvent, 'type'>) => void
  ) => () => void
  onContextMenuDismissed: (callback: (event: { browserPageId: string }) => void) => () => void
  onActivateView: (
    callback: (event: { worktreeId?: string; browserPageId?: string }) => void
  ) => () => void
  onPaneFocus: (
    callback: (event: { worktreeId: string | null; browserPageId: string }) => void
  ) => () => void
  onGrabModeToggle: (callback: (browserPageId: string) => void) => () => void
  onGrabActionShortcut: (
    callback: (event: { browserPageId: string; key: 'c' | 's' }) => void
  ) => () => void
}

const browserGuestEventFanOut = createRuntimeStreamFanOut<
  void,
  RuntimeBrowserGuestSubscriptionEvent
>({
  resolveClient: () => Promise.resolve(),
  open: (_client, signal) =>
    callRuntimeOrpc(
      { kind: 'local' },
      (client) => client.browser.guestEvents.subscribe,
      undefined,
      { signal }
    )
})

export const browserShellEventsClient: BrowserShellEventsClient = {
  onGuestLoadFailed: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'guestLoadFailed') {
        callback(event)
      }
    }),
  onCertificateFailureChanged: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'certificateFailureChanged') {
        callback(event)
      }
    }),
  onPermissionDenied: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'permissionDenied') {
        callback(event)
      }
    }),
  onPopup: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'popup') {
        callback(event)
      }
    }),
  onDownloadRequested: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'downloadRequested') {
        callback(event)
      }
    }),
  onDownloadProgress: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'downloadProgress') {
        callback(event)
      }
    }),
  onDownloadFinished: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'downloadFinished') {
        callback(event)
      }
    }),
  onNavigationUpdate: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'navigationUpdate') {
        callback(event)
      }
    }),
  onOpenLinkInYiruTab: (callback) =>
    browserGuestEventFanOut.subscribe((event) => {
      if (event.type === 'openLinkInYiruTab') {
        callback(event)
      }
    }),
  onContextMenuRequested: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'browserContextMenuRequested') {
        callback(event)
      }
    }),
  onContextMenuDismissed: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'browserContextMenuDismissed') {
        callback(event)
      }
    }),
  onActivateView: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'browserActivateView') {
        callback(event)
      }
    }),
  onPaneFocus: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'browserPaneFocus') {
        callback(event)
      }
    }),
  onGrabModeToggle: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'browserGrabModeToggle') {
        callback(event.browserPageId)
      }
    }),
  onGrabActionShortcut: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'browserGrabActionShortcut') {
        callback(event)
      }
    })
}
