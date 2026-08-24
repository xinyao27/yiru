import {
  normalizeBrowserNavigationUrl,
  redactKagiSessionToken,
  toSecureCertificateEndpoint
} from '~shared/browser/url'
import { YIRU_BROWSER_BLANK_URL } from '~shared/constants'

import { isChromiumInternalErrorUrl, safeOrigin } from './manager-foundation'
import { BrowserManagerPolicies } from './manager-policies'
import { openPopupWithOriginBar, type PopupChildWindowOptions } from './popup-origin-bar-window'

export abstract class BrowserManagerNavigation extends BrowserManagerPolicies {
  protected attachGuestNavigationPolicies(guest: Electron.WebContents): () => void {
    let allowInitialFileNavigation = true
    const navigationGuard = (event: Electron.Event, url: string): void => {
      const normalizedUrl = normalizeBrowserNavigationUrl(url)
      // Why: blob: URLs are same-origin (inherit the creator's origin) and are
      // used by Cloudflare Turnstile to load challenge resources inside iframes.
      // Blocking them triggers error 600010 ("bot behavior detected"). Only
      // allow blobs whose embedded origin is http(s) to maintain defense-in-depth
      // against blob:null or other opaque-origin blobs.
      if (url.startsWith('blob:https://') || url.startsWith('blob:http://')) {
        return
      }
      // Why: an explicitly opened local preview can be the first navigation
      // from a blank tab. Permit that one transition only while the guest is
      // still blank; after any real navigation, a page must not be able to
      // redirect the guest to file:// and probe the local filesystem.
      if (url.startsWith('file:')) {
        let currentUrl = ''
        try {
          currentUrl = guest.getURL()
        } catch {
          // Why: a destroyed guest must fail closed instead of receiving the
          // one-time file preview exception.
        }
        if (
          allowInitialFileNavigation &&
          normalizeBrowserNavigationUrl(currentUrl) === YIRU_BROWSER_BLANK_URL
        ) {
          allowInitialFileNavigation = false
          return
        }
        event.preventDefault()
        return
      }
      if (normalizedUrl !== YIRU_BROWSER_BLANK_URL) {
        allowInitialFileNavigation = false
      }
      if (!normalizedUrl) {
        // Why: `will-attach-webview` only validates the initial src. Main must
        // keep enforcing the same allowlist for later guest navigations too.
        event.preventDefault()
      }
    }

    const didFailLoadHandler = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame) {
        return
      }
      const browserPageId = this.tabIdByWebContentsId.get(guest.id)
      const certificateFailure = browserPageId
        ? this.certificateTrustController?.getFailure(browserPageId)
        : null
      if (
        certificateFailure &&
        toSecureCertificateEndpoint(validatedURL || guest.getURL()) ===
          toSecureCertificateEndpoint(certificateFailure.origin)
      ) {
        // Why: a request-guard cancellation is the transport for the existing
        // certificate warning; do not replace it with ERR_ABORTED/blocked copy.
        return
      }
      if (errorCode === -3) {
        // Why: an aborted main-frame nav never committed, so restore the error
        // did-start-navigation optimistically cleared — otherwise a retry that
        // aborts leaves the failed page with no overlay.
        const clearedError = this.clearedLoadErrorsByGuestId.get(guest.id)
        if (clearedError !== undefined) {
          this.clearedLoadErrorsByGuestId.delete(guest.id)
          this.loadErrorsByGuestId.set(guest.id, clearedError)
          this.forwardOrQueueGuestLoadFailure(guest.id, clearedError)
          this.notifyBrowserGuestStateChanged(guest.id)
        }
        return
      }
      this.clearedLoadErrorsByGuestId.delete(guest.id)
      const loadError = {
        code: errorCode,
        description: errorDescription || 'This site could not be reached.',
        validatedUrl: redactKagiSessionToken(validatedURL || guest.getURL() || 'about:blank')
      }
      this.loadErrorsByGuestId.set(guest.id, loadError)
      this.forwardOrQueueGuestLoadFailure(guest.id, loadError)
      this.notifyBrowserGuestStateChanged(guest.id)
    }

    const didStartNavigationHandler = (
      _event: Electron.Event,
      url: string,
      _isInPlace: boolean,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame || isChromiumInternalErrorUrl(url)) {
        return
      }
      if (normalizeBrowserNavigationUrl(url) !== YIRU_BROWSER_BLANK_URL) {
        allowInitialFileNavigation = false
      }
      this.certificateTrustController?.onMainFrameNavigationStarted(guest.id)
      // Why: a failure queued before renderer registration belongs only to the
      // navigation that produced it. A replacement navigation must not replay
      // that stale failure when its later dom-ready registers the guest.
      this.pendingLoadFailuresByGuestId.delete(guest.id)
      const activeError = this.loadErrorsByGuestId.get(guest.id)
      if (activeError === undefined) {
        // Why: no error to hide; drop any stale stash so a later abort cannot
        // resurrect an error from a navigation that already succeeded.
        this.clearedLoadErrorsByGuestId.delete(guest.id)
        return
      }
      this.clearedLoadErrorsByGuestId.set(guest.id, activeError)
      this.loadErrorsByGuestId.delete(guest.id)
      this.notifyBrowserGuestStateChanged(guest.id)
    }

    const didNavigateHandler = (_event: Electron.Event, url: string): void => {
      if (normalizeBrowserNavigationUrl(url) !== YIRU_BROWSER_BLANK_URL) {
        allowInitialFileNavigation = false
      }
      // Why: a committed navigation means the optimistic stash from
      // did-start-navigation is obsolete — drop it so a later ERR_ABORTED
      // cannot restore a failure over the already-committed page.
      this.clearedLoadErrorsByGuestId.delete(guest.id)
      this.certificateTrustController?.onMainFrameNavigationCommitted(guest.id, url)
      // Why: headless mobile session tabs expose the live history affordances
      // from this WebContents. Publish after commit so Back/Forward state is
      // refreshed without making renderer-hosted guests depend on it.
      this.notifyBrowserGuestStateChanged(guest.id)
    }

    guest.on('will-navigate', navigationGuard)
    guest.on('will-redirect', navigationGuard)
    guest.on('did-start-navigation', didStartNavigationHandler)
    guest.on('did-navigate', didNavigateHandler)
    guest.on('did-fail-load', didFailLoadHandler)

    return () => {
      if (guest.isDestroyed()) {
        return
      }
      guest.off('will-navigate', navigationGuard)
      guest.off('will-redirect', navigationGuard)
      guest.off('did-start-navigation', didStartNavigationHandler)
      guest.off('did-navigate', didNavigateHandler)
      guest.off('did-fail-load', didFailLoadHandler)
    }
  }

  protected createPopupChildWindowWithOriginBar(
    openerGuest: Electron.WebContents,
    targetUrl: string,
    options: PopupChildWindowOptions
  ): Electron.WebContents {
    const popup = openPopupWithOriginBar(options, targetUrl)
    // Why: Electron does not emit did-create-window for createWindow-created
    // children, so the opener's policies and routing context attach here.
    this.attachGuestPolicies(
      popup.contentWebContents,
      this.resolvePopupOwnerContext(openerGuest.id)
    )
    this.forwardOrQueuePopupEvent(openerGuest.id, {
      origin: safeOrigin(targetUrl),
      action: 'opened-in-yiru'
    })
    // Why: parity with Electron's default child-window lifecycle — closing the
    // owning browser tab must not leave orphaned session-bearing popups.
    const closePopupWithOpener = (): void => popup.close()
    openerGuest.once('destroyed', closePopupWithOpener)
    popup.onClosed(() => {
      if (!openerGuest.isDestroyed()) {
        openerGuest.off('destroyed', closePopupWithOpener)
      }
    })
    return popup.contentWebContents
  }

  protected retireStaleGuestWebContents(previousWebContentsId: number): void {
    // Why: a browser page can re-register with a new guest id after Chromium
    // swaps renderer processes. Late events from the dead guest must stop
    // resolving to the live page, or stale download/popup/permission callbacks
    // can be delivered to the wrong session after the swap.
    this.cleanupGuestPolicyAttachment(previousWebContentsId)
    this.tabIdByWebContentsId.delete(previousWebContentsId)
  }

  protected cleanupGuestPolicyAttachment(guestWebContentsId: number): void {
    const isPrimaryGuest = this.tabIdByWebContentsId.has(guestWebContentsId)
    this.certificateTrustController?.onGuestRetired(guestWebContentsId)
    const policyCleanup = this.policyCleanupByGuestId.get(guestWebContentsId)
    if (policyCleanup) {
      policyCleanup()
      this.policyCleanupByGuestId.delete(guestWebContentsId)
    }
    this.policyAttachedGuestIds.delete(guestWebContentsId)
    this.clickedLinkFrameNameByGuestId.delete(guestWebContentsId)
    this.externalClickedLinkFrameNameByGuestId.delete(guestWebContentsId)
    this.offscreenGuestIds.delete(guestWebContentsId)
    this.popupOwnerContextByGuestId.delete(guestWebContentsId)
    // Why: a popup must stop inheriting authorization as soon as its primary
    // owner is retired, even if Chromium has not destroyed the child yet.
    if (isPrimaryGuest) {
      for (const [popupGuestId, owner] of this.popupOwnerContextByGuestId) {
        if (owner.rootGuestWebContentsId === guestWebContentsId) {
          this.popupOwnerContextByGuestId.delete(popupGuestId)
          this.shellConnectionIdByGuestId.delete(popupGuestId)
        }
      }
    }
    this.pendingLoadFailuresByGuestId.delete(guestWebContentsId)
    this.loadErrorsByGuestId.delete(guestWebContentsId)
    this.clearedLoadErrorsByGuestId.delete(guestWebContentsId)
    this.pendingPermissionEventsByGuestId.delete(guestWebContentsId)
    this.pendingPopupEventsByGuestId.delete(guestWebContentsId)
    this.shellConnectionIdByGuestId.delete(guestWebContentsId)
    this.cancelPendingDownloadsForGuest(guestWebContentsId)
  }
}
