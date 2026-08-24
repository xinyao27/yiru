import { randomUUID } from 'node:crypto'

import { requestShellOpenExternal } from '~main/runtime/rpc/orpc/shell-services-reverse-link'
import {
  normalizeBrowserNavigationUrl,
  normalizeExternalBrowserUrl,
  redactKagiSessionToken
} from '~shared/browser/url'

import {
  BROWSER_CLICKED_LINK_ROUTING_WORLD_ID,
  buildBrowserClickedLinkRoutingScript,
  buildBrowserIframeClickedLinkRoutingScript
} from './clicked-link-routing'
import { SAFE_POPUP_WINDOW_OPTIONS, type PopupOwnerContext, safeOrigin } from './manager-foundation'
import { BrowserManagerVisibility } from './manager-visibility'
import type { PopupChildWindowOptions } from './popup-origin-bar-window'

export abstract class BrowserManagerPolicies extends BrowserManagerVisibility {
  attachGuestPolicies(
    guest: Electron.WebContents,
    inheritedOwnerContext: PopupOwnerContext | null = null,
    shellConnectionId: string | null = null
  ): void {
    if (this.policyAttachedGuestIds.has(guest.id)) {
      return
    }
    this.policyAttachedGuestIds.add(guest.id)
    if (inheritedOwnerContext) {
      this.popupOwnerContextByGuestId.set(guest.id, inheritedOwnerContext)
      const inheritedShellConnectionId = this.shellConnectionIdByGuestId.get(
        inheritedOwnerContext.rootGuestWebContentsId
      )
      if (inheritedShellConnectionId) {
        this.shellConnectionIdByGuestId.set(guest.id, inheritedShellConnectionId)
      }
    } else if (shellConnectionId) {
      this.shellConnectionIdByGuestId.set(guest.id, shellConnectionId)
    }
    // Why: OAuth child windows must retain normal link/window relationships;
    // only the primary embedded browser converts new-tab clicks to Yiru tabs.
    const clickedLinkFrameName = inheritedOwnerContext
      ? null
      : `__yiru_clicked_link_foreground_${randomUUID()}`
    const externalClickedLinkFrameName = inheritedOwnerContext
      ? null
      : `__yiru_clicked_link_external_${randomUUID()}`
    if (clickedLinkFrameName) {
      this.clickedLinkFrameNameByGuestId.set(guest.id, clickedLinkFrameName)
    }
    if (externalClickedLinkFrameName) {
      this.externalClickedLinkFrameNameByGuestId.set(guest.id, externalClickedLinkFrameName)
    }
    let clickedLinkRoutingActive = Boolean(clickedLinkFrameName && externalClickedLinkFrameName)

    // Why: anti-detection can install at attach time, while the sessionStorage
    // script waits for renderer registration to supply the stable page id.
    const disposeGuestDocumentScripts = this.injectGuestDocumentScripts(guest)

    // Why: background throttling must be disabled so agent-driven screenshots
    // (Page.captureScreenshot via CDP proxy) can capture frames even when the
    // Yiru window is not the focused foreground app. With throttling enabled,
    // the compositor stops producing frames and capturePage() returns empty.
    guest.setBackgroundThrottling(false)
    const installClickedLinkRouting = (): void => {
      if (
        !clickedLinkRoutingActive ||
        !clickedLinkFrameName ||
        !externalClickedLinkFrameName ||
        guest.isDestroyed()
      ) {
        return
      }
      // Why: an isolated-world click listener can label real anchor clicks
      // without exposing the protected frame name to untrusted page scripts.
      void guest
        .executeJavaScriptInIsolatedWorld(
          BROWSER_CLICKED_LINK_ROUTING_WORLD_ID,
          [
            {
              // Why: mobile emulation spoofs the guest UA as iOS, so modifier
              // routing must use the actual desktop host platform from main.
              code: buildBrowserClickedLinkRoutingScript(
                clickedLinkFrameName,
                externalClickedLinkFrameName,
                process.platform === 'darwin'
              )
            }
          ],
          false
        )
        .catch(() => {})
    }
    if (clickedLinkFrameName) {
      guest.on('dom-ready', installClickedLinkRouting)
    }
    const pendingIframeRoutingInstalls = new Map<Electron.WebFrameMain, () => void>()
    const iframeFrameNamesByFrame = new Map<
      Electron.WebFrameMain,
      { external: string; yiru: string }
    >()
    const iframeFrameByFrameName = new Map<string, Electron.WebFrameMain>()
    const externalIframeFrameNames = new Set<string>()
    const clearIframeFrameName = (frame: Electron.WebFrameMain): void => {
      const names = iframeFrameNamesByFrame.get(frame)
      if (!names) {
        return
      }
      iframeFrameNamesByFrame.delete(frame)
      iframeFrameByFrameName.delete(names.yiru)
      iframeFrameByFrameName.delete(names.external)
      externalIframeFrameNames.delete(names.external)
    }
    const installIframeClickedLinkRouting = (frame: Electron.WebFrameMain): void => {
      clearIframeFrameName(frame)
      if (!clickedLinkRoutingActive || frame.isDestroyed()) {
        return
      }
      const names = {
        yiru: `__yiru_clicked_link_iframe_foreground_${randomUUID()}`,
        external: `__yiru_clicked_link_iframe_external_${randomUUID()}`
      }
      iframeFrameNamesByFrame.set(frame, names)
      iframeFrameByFrameName.set(names.yiru, frame)
      iframeFrameByFrameName.set(names.external, frame)
      externalIframeFrameNames.add(names.external)
      // Why: child-frame tokens live in the page world, so they are consumed
      // after one trusted click and replaced before another can be routed.
      void frame
        .executeJavaScript(
          buildBrowserIframeClickedLinkRoutingScript(
            names.yiru,
            names.external,
            process.platform === 'darwin'
          ),
          false
        )
        .catch(() => {
          if (iframeFrameNamesByFrame.get(frame)?.yiru === names.yiru) {
            clearIframeFrameName(frame)
          }
        })
    }
    const handleFrameCreated = (
      _event: Electron.Event,
      { frame }: Electron.FrameCreatedDetails
    ): void => {
      if (!clickedLinkFrameName || !frame || frame.parent === null) {
        return
      }
      for (const knownFrame of iframeFrameNamesByFrame.keys()) {
        if (knownFrame.isDestroyed()) {
          clearIframeFrameName(knownFrame)
        }
      }
      const installAfterDomReady = (): void => {
        pendingIframeRoutingInstalls.delete(frame)
        installIframeClickedLinkRouting(frame)
      }
      pendingIframeRoutingInstalls.set(frame, installAfterDomReady)
      frame.once('dom-ready', installAfterDomReady)
    }
    if (clickedLinkFrameName) {
      guest.on('frame-created', handleFrameCreated)
    }
    const disposeNavigationPolicies = this.attachGuestNavigationPolicies(guest)
    const handleDidCreateWindow = (window: Electron.BrowserWindow): void => {
      // Why: popup descendants inherit the opener's owner context for routing,
      // but must not replace its primary guest registration.
      this.attachGuestPolicies(window.webContents, this.resolvePopupOwnerContext(guest.id))
    }
    guest.on('did-create-window', handleDidCreateWindow)
    guest.setWindowOpenHandler(({ url, frameName }) => {
      const browserTabId = this.resolveBrowserTabIdForGuestWebContentsId(guest.id)
      const browserUrl = normalizeBrowserNavigationUrl(url)
      const externalUrl = normalizeExternalBrowserUrl(url)
      const expectedClickedLinkFrameName = this.clickedLinkFrameNameByGuestId.get(guest.id)
      const expectedExternalClickedLinkFrameName = this.externalClickedLinkFrameNameByGuestId.get(
        guest.id
      )
      const iframeFrame = frameName ? iframeFrameByFrameName.get(frameName) : undefined
      let clickedLinkTarget: 'external' | 'yiru' | null =
        expectedClickedLinkFrameName && frameName === expectedClickedLinkFrameName
          ? 'yiru'
          : expectedExternalClickedLinkFrameName &&
              frameName === expectedExternalClickedLinkFrameName
            ? 'external'
            : null
      if (!clickedLinkTarget && iframeFrame) {
        clickedLinkTarget = externalIframeFrameNames.has(frameName) ? 'external' : 'yiru'
        clearIframeFrameName(iframeFrame)
        queueMicrotask(() => installIframeClickedLinkRouting(iframeFrame))
      }

      if (clickedLinkTarget) {
        if (clickedLinkTarget === 'yiru' && browserTabId && browserUrl) {
          this.forwardClickedLink(browserTabId, browserUrl)
        } else if (clickedLinkTarget === 'external' && externalUrl) {
          const shellConnectionId = this.shellConnectionIdByGuestId.get(guest.id)
          void requestShellOpenExternal(shellConnectionId, {
            url: redactKagiSessionToken(externalUrl)
          }).then(({ opened }) => {
            this.forwardOrQueuePopupEvent(guest.id, {
              origin: safeOrigin(externalUrl),
              action: opened ? 'opened-external' : 'blocked'
            })
          })
        } else if (clickedLinkTarget === 'external') {
          this.forwardOrQueuePopupEvent(guest.id, {
            origin: safeOrigin(url),
            action: 'blocked'
          })
        }
        // Why: a recognized user gesture must never fall through to a native
        // popup merely because its renderer disappeared during the click.
        return { action: 'deny' }
      }

      // Why: guarded OAuth children need a validated external destination.
      // Blank and local-file popups must never create a child window.
      const canOpenAsChild = Boolean(externalUrl)
      if (browserTabId && canOpenAsChild) {
        // Why: OAuth may request ordinary size/position features, but browser
        // content must not create deceptive or inescapable native chrome.
        return {
          action: 'allow',
          overrideBrowserWindowOptions: SAFE_POPUP_WINDOW_OPTIONS,
          // Why: a default child window has no address bar, so users cannot
          // verify a popup's destination. Host it in a Yiru window with an
          // origin bar while keeping the shared session + window.opener.
          createWindow: (options: PopupChildWindowOptions) =>
            this.createPopupChildWindowWithOriginBar(guest, url, options)
        }
      } else if (externalUrl) {
        // Why: a target=_blank click on a Kagi search result page produces a
        // popup URL that still contains the bearer token; redact before
        // handing the URL to the shell's default browser.
        const shellConnectionId = this.shellConnectionIdByGuestId.get(guest.id)
        void requestShellOpenExternal(shellConnectionId, {
          url: redactKagiSessionToken(externalUrl)
        }).then(({ opened }) => {
          this.forwardOrQueuePopupEvent(guest.id, {
            origin: safeOrigin(externalUrl),
            action: opened ? 'opened-external' : 'blocked'
          })
        })
      } else {
        // Why: popup attempts can carry auth redirects and one-time tokens.
        // Surface only sanitized origin metadata so the renderer can explain
        // the blocked action without persisting sensitive URL details.
        this.forwardOrQueuePopupEvent(guest.id, {
          origin: safeOrigin(url),
          action: 'blocked'
        })
      }
      return { action: 'deny' }
    })

    const handleDestroyed = (): void => {
      // Why: guests can be destroyed before renderer registration. Without
      // this, attach-time policy closures remain retained until app shutdown.
      this.cleanupGuestPolicyAttachment(guest.id)
    }
    guest.on('destroyed', handleDestroyed)

    // Why: store cleanup so unregisterGuest can remove these listeners when the
    // guest surface is torn down, preventing the callbacks from preventing GC of
    // the underlying WebContents wrapper.
    this.policyCleanupByGuestId.set(guest.id, () => {
      disposeGuestDocumentScripts()
      try {
        guest.off('destroyed', handleDestroyed)
        guest.off('did-create-window', handleDidCreateWindow)
        if (clickedLinkFrameName) {
          clickedLinkRoutingActive = false
          guest.off('dom-ready', installClickedLinkRouting)
          guest.off('frame-created', handleFrameCreated)
          for (const [frame, install] of pendingIframeRoutingInstalls) {
            if (!frame.isDestroyed()) {
              frame.off('dom-ready', install)
            }
          }
          pendingIframeRoutingInstalls.clear()
          iframeFrameNamesByFrame.clear()
          iframeFrameByFrameName.clear()
          externalIframeFrameNames.clear()
        }
      } catch {
        // guest may already be destroyed
      }
      disposeNavigationPolicies()
    })
  }
}
