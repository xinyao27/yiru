import type { RuntimeBrowserGuestEvent } from '@yiru/runtime-protocol/contract'
import type { BrowserGrabCancelReason } from '~shared/browser/grab-types'
import type {
  BrowserDownloadFinishedEvent,
  BrowserDownloadProgressEvent
} from '~shared/browser/guest-events'
import type { KeybindingOverrides } from '~shared/keybindings'
import type { BrowserLoadError } from '~shared/types'

import type { BrowserCertificateTrustController } from './certificate-trust-controller'
import { BrowserGrabSessionController } from './grab-session-controller'
import type {
  ActiveDownload,
  PendingPermissionEvent,
  PendingPopupEvent,
  PopupOwnerContext
} from './manager-foundation'
import { BrowserPageRegistry } from './page/registry'
import type { PopupChildWindowOptions } from './popup-origin-bar-window'
import type { BrowserDownloadItem, BrowserSession } from './session'

export abstract class BrowserManagerFoundation {
  protected readonly pageRegistry: BrowserPageRegistry

  constructor(pageRegistry = new BrowserPageRegistry()) {
    this.pageRegistry = pageRegistry
  }

  // Why: guest events are pushed to the focused window's WebContents, which
  // paired web/mobile clients do not have. The runtime installs a publisher
  // here so the same payload also reaches `browser.guestEvents.subscribe`.
  protected publishGuestEvent: (event: RuntimeBrowserGuestEvent) => void = () => {}
  protected settingsResolver:
    | (() => {
        keybindings?: KeybindingOverrides
        mobileEmulatorEnabled?: boolean
      })
    | null = null
  setGuestEventPublisher(publish: (event: RuntimeBrowserGuestEvent) => void): void {
    this.publishGuestEvent = publish
  }

  protected readonly webContentsIdByTabId = new Map<string, number>()
  // Why: reverse map enables O(1) guest→tab lookups instead of O(N) linear
  // scans on every mouse event, load failure, permission, and popup event.
  protected readonly tabIdByWebContentsId = new Map<number, string>()
  protected readonly popupOwnerContextByGuestId = new Map<number, PopupOwnerContext>()
  protected readonly shellConnectionIdByGuestId = new Map<number, string>()
  // Why: guest registration is keyed by browser page id, but renderer
  // visibility/focus state is keyed by browser workspace id. Screenshot prep
  // has to bridge that mismatch to activate the right tab before capture.
  protected readonly workspaceIdByPageId = new Map<string, string>()
  protected readonly sessionProfileIdByPageId = new Map<string, string | null>()
  protected readonly rendererWebContentsIdByTabId = new Map<string, number>()
  // Why: chain setViewportOverride calls per tab so rapid toggles don't
  // interleave CDP commands. Without serialization, two concurrent calls can
  // race (e.g. clearDeviceMetricsOverride landing after a later mobile
  // setDeviceMetricsOverride), leaving emulation in an unexpected state.
  protected readonly viewportOpsByTabId = new Map<string, Promise<unknown>>()
  protected readonly contextMenuCleanupByTabId = new Map<string, () => void>()
  protected readonly grabShortcutCleanupByTabId = new Map<string, () => void>()
  protected readonly shortcutForwardingCleanupByTabId = new Map<string, () => void>()
  protected readonly mouseWheelZoomCleanupByTabId = new Map<string, () => void>()
  protected readonly annotationViewportBridgeOpsByTabId = new Map<string, Promise<unknown>>()
  protected readonly worktreeIdByTabId = new Map<string, string>()
  protected readonly policyAttachedGuestIds = new Set<number>()
  protected readonly offscreenGuestIds = new Set<number>()
  protected readonly policyCleanupByGuestId = new Map<number, () => void>()
  protected readonly guestDocumentScriptInstallers = new Map<
    number,
    (browserPageId?: string) => Promise<void>
  >()
  protected readonly guestRegistrationAttemptByTabId = new Map<
    string,
    { token: symbol; webContentsId: number }
  >()
  protected readonly clickedLinkFrameNameByGuestId = new Map<number, string>()
  protected readonly externalClickedLinkFrameNameByGuestId = new Map<number, string>()
  protected readonly loadErrorsByGuestId = new Map<number, BrowserLoadError>()
  // Why: did-start-navigation optimistically hides the overlay, but an aborted
  // nav never commits — stash the cleared error so did-fail-load(-3) can restore
  // it instead of stranding the user on a blank surface.
  protected readonly clearedLoadErrorsByGuestId = new Map<number, BrowserLoadError>()
  protected browserGuestStateChangedListener: ((worktreeId: string) => void) | null = null
  protected certificateTrustController: BrowserCertificateTrustController | null = null
  protected readonly pendingLoadFailuresByGuestId = new Map<
    number,
    { code: number; description: string; validatedUrl: string }
  >()
  protected readonly pendingPermissionEventsByGuestId = new Map<number, PendingPermissionEvent[]>()
  protected readonly pendingPopupEventsByGuestId = new Map<number, PendingPopupEvent[]>()
  protected readonly pendingDownloadIdsByGuestId = new Map<number, string[]>()
  protected readonly downloadsById = new Map<string, ActiveDownload>()
  protected readonly grabSessionController = new BrowserGrabSessionController()

  setBrowserGuestStateChangedListener(listener: ((worktreeId: string) => void) | null): void {
    this.browserGuestStateChangedListener = listener
  }

  setCertificateTrustController(controller: BrowserCertificateTrustController): void {
    this.certificateTrustController = controller
  }

  installCertificateRequestGuard(session: BrowserSession): void {
    this.certificateTrustController?.installSessionRequestGuard(session)
  }

  removeCertificateRequestGuard(session: BrowserSession): void {
    this.certificateTrustController?.removeSessionRequestGuard(session)
  }

  setSettingsResolver(
    resolver: () => {
      keybindings?: KeybindingOverrides
      mobileEmulatorEnabled?: boolean
    }
  ): void {
    this.settingsResolver = resolver
  }

  // Why: Page.addScriptToEvaluateOnNewDocument (via the CDP debugger) is the
  // only reliable way to install guest behavior before page scripts on every
  // navigation. The previous did-start-navigation approach ran in the old page.
  //
  // Returns a cleanup function that removes the detach listener and prevents
  // further re-attach attempts.

  protected abstract attachGuestNavigationPolicies(guest: Electron.WebContents): () => void
  protected abstract createPopupChildWindowWithOriginBar(
    openerGuest: Electron.WebContents,
    targetUrl: string,
    options: PopupChildWindowOptions
  ): Electron.WebContents
  protected abstract cleanupGuestPolicyAttachment(guestWebContentsId: number): void
  protected abstract forwardOrQueuePopupEvent(
    guestWebContentsId: number,
    event: PendingPopupEvent
  ): void
  protected abstract forwardOrQueueGuestLoadFailure(
    guestWebContentsId: number,
    loadError: BrowserLoadError
  ): void
  protected abstract forwardOrQueuePermissionDenied(
    guestWebContentsId: number,
    event: PendingPermissionEvent
  ): void
  protected abstract forwardClickedLink(browserTabId: string, rawUrl: string): void
  protected abstract setupContextMenu(browserTabId: string, guest: Electron.WebContents): void
  protected abstract setupGrabShortcut(browserTabId: string, guest: Electron.WebContents): void
  protected abstract setupShortcutForwarding(
    browserTabId: string,
    guest: Electron.WebContents
  ): void
  protected abstract setupMouseWheelZoomForwarding(
    browserTabId: string,
    guest: Electron.WebContents
  ): void
  protected abstract flushPendingPermissionEvents(
    browserTabId: string,
    guestWebContentsId: number
  ): void
  protected abstract flushPendingPopupEvents(browserTabId: string, guestWebContentsId: number): void
  protected abstract flushPendingDownloadRequests(
    browserTabId: string,
    guestWebContentsId: number
  ): void
  protected abstract flushPendingLoadFailure(browserTabId: string, guestWebContentsId: number): void
  protected abstract cancelPendingDownloadsForGuest(guestWebContentsId: number): void
  protected abstract notifyBrowserGuestStateChanged(webContentsId: number): void
  protected abstract bindDownloadToTab(downloadId: string, browserTabId: string): void
  protected abstract sendDownloadStarted(downloadId: string): void
  protected abstract sendDownloadProgress(
    browserTabId: string | null,
    payload: BrowserDownloadProgressEvent
  ): void
  protected abstract finishDownloadInternal(
    downloadId: string,
    status: BrowserDownloadFinishedEvent['status'],
    error: string | null
  ): void
  protected abstract cancelDownloadInternal(downloadId: string, reason: string): void
  protected abstract getDownloadReceivedBytes(item: BrowserDownloadItem): number
  protected abstract sendGuestLoadFailure(browserTabId: string, loadError: BrowserLoadError): void
  abstract cancelGrabOp(browserTabId: string, reason: BrowserGrabCancelReason): void
}
