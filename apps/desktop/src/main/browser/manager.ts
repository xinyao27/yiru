/* eslint-disable max-lines -- Why: BrowserManager intentionally remains the
single privileged facade for guest registration, authorization, and lifecycle
cleanup even after extracting the grab/session helpers. Keeping that ownership
in one file avoids scattering the browser security boundary across modules. */
import { randomUUID } from 'node:crypto'

import type { RuntimeBrowserGuestEvent } from '@yiru/runtime-protocol/contract'
import { requestShellOpenExternal } from '~main/runtime/rpc/orpc/shell-services-reverse-link'
import {
  type BrowserAnnotationViewportBridgeOptions,
  buildBrowserAnnotationViewportBridgeScript
} from '~shared/browser/annotation-viewport-bridge'
import type {
  BrowserGrabCancelReason,
  BrowserGrabPayload,
  BrowserGrabRect,
  BrowserGrabResult,
  BrowserGrabScreenshot
} from '~shared/browser/grab-types'
import type {
  BrowserDownloadFinishedEvent,
  BrowserDownloadProgressEvent,
  BrowserPermissionDeniedEvent,
  BrowserPopupEvent
} from '~shared/browser/guest-events'
import { buildSessionStoragePersistenceScript } from '~shared/browser/session-storage-persistence'
import {
  normalizeBrowserNavigationUrl,
  normalizeExternalBrowserUrl,
  redactKagiSessionToken,
  toSecureCertificateEndpoint
} from '~shared/browser/url'
import { YIRU_BROWSER_BLANK_URL } from '~shared/constants'
import type { KeybindingOverrides } from '~shared/keybindings'
import type { BrowserViewportOverride } from '~shared/types'
import type { BrowserCertificateFailure, BrowserLoadError } from '~shared/types'

import { ANTI_DETECTION_SCRIPT } from './anti-detection'
import {
  BrowserCertificateTrustController,
  type ManagedBrowserGuestContext
} from './certificate-trust-controller'
import {
  BROWSER_CLICKED_LINK_ROUTING_WORLD_ID,
  buildBrowserClickedLinkRoutingScript,
  buildBrowserIframeClickedLinkRoutingScript
} from './clicked-link-routing'
import { browserDownloadDestinationReservations } from './download-destination'
import { buildGuestOverlayScript } from './grab-guest-script'
import { clampGrabPayload } from './grab-payload'
import { captureSelectionScreenshot as captureGrabSelectionScreenshot } from './grab-screenshot'
import { BrowserGrabSessionController } from './grab-session-controller'
import {
  setupGrabShortcutForwarding,
  setupGuestContextMenu,
  setupGuestMouseWheelZoomForwarding,
  setupGuestShortcutForwarding
} from './guest-ui'
import {
  createElectronBrowserPageHandle,
  electronBrowserBackendPageId,
  electronBrowserWebContentsId,
  resolveElectronBrowserWebContents
} from './page/electron-handle'
import { evaluateBrowserPage, evaluateBrowserPageIsolated } from './page/evaluation'
import type { BrowserPageCdpLease, BrowserPageHandle } from './page/handle'
import { BrowserPageRegistry } from './page/registry'
import { openPopupWithOriginBar, type PopupChildWindowOptions } from './popup-origin-bar-window'
import type { BrowserDownloadItem, BrowserSession } from './session'
import { cleanElectronUserAgent } from './session-ua'

const AUTOMATION_VISIBILITY_ACQUIRE_TIMEOUT_MS = 2_000

function isChromiumInternalErrorUrl(url: string): boolean {
  return url.startsWith('chrome-error://')
}

function resolveWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<{ value: T; timedOut: boolean }> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ value: fallbackValue, timedOut: true }), timeoutMs)
  })
  return Promise.race([
    promise.then((value) => ({ value, timedOut: false })),
    timeoutPromise
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}

function releaseAutomationVisibilityToken(renderer: Electron.WebContents, token: string): void {
  if (renderer.isDestroyed()) {
    return
  }
  renderer
    .executeJavaScript(
      `(function() {
        var bridge = window.__yiruBrowserAutomationVisibility;
        if (!bridge || typeof bridge.release !== 'function') return false;
        return bridge.release(${JSON.stringify(token)});
      })()`
    )
    .catch(() => {})
}

function cleanupLateAutomationVisibilityToken(
  renderer: Electron.WebContents,
  acquirePromise: Promise<unknown>
): void {
  acquirePromise
    .then((lateToken) => {
      if (typeof lateToken !== 'string' || lateToken.length === 0) {
        return
      }
      // Why: the renderer creates the lease before waiting for paint; if main's
      // acquire timeout wins, release the eventual token so hidden webviews do
      // not stay paintable indefinitely.
      releaseAutomationVisibilityToken(renderer, lateToken)
    })
    .catch(() => {})
}

function createNoopRestoreForTimedOutAutomationAcquire(
  renderer: Electron.WebContents,
  acquirePromise: Promise<unknown>,
  timedOut: boolean
): () => void {
  if (timedOut) {
    cleanupLateAutomationVisibilityToken(renderer, acquirePromise)
  }
  return () => {}
}

function isAutomationVisibilityToken(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0
}

// Why: mobile presets need a touch-capable UA or responsive sites serve the
// desktop variant based on UA sniffing. This is the Chrome DevTools default
// iPhone UA template; we splice in the guest session's real Chrome major so
// sec-ch-ua headers (see setupClientHintsOverride) stay consistent.
function buildMobileUserAgent(chromeMajor: string): string {
  return `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${chromeMajor}.0.0.0 Mobile/15E148 Safari/604.1`
}

function extractChromeMajor(ua: string): string {
  const match = ua.match(/Chrome\/(\d+)/)
  return match ? match[1] : '134'
}

export type BrowserGuestRegistration = {
  browserPageId?: string
  browserTabId?: string
  workspaceId?: string
  worktreeId?: string
  sessionProfileId?: string | null
  backendPageId: string
  rendererOwnerId: string
  shellConnectionId: string
}

type PendingPermissionEvent = Omit<BrowserPermissionDeniedEvent, 'browserPageId'>
type PendingPopupEvent = Omit<BrowserPopupEvent, 'browserPageId'>
type BrowserDownloadDoneState = 'completed' | 'cancelled' | 'interrupted'
type PopupOwnerContext = {
  browserTabId: string
  rootGuestWebContentsId: number
}
const SAFE_POPUP_WINDOW_OPTIONS = {
  alwaysOnTop: false,
  closable: true,
  focusable: true,
  frame: true,
  fullscreen: false,
  kiosk: false,
  modal: false,
  movable: true,
  opacity: 1,
  show: true,
  simpleFullscreen: false,
  skipTaskbar: false,
  titleBarStyle: 'default',
  transparent: false,
  // Why: applied by Electron when it creates the popup's WebContents, before
  // createWindow runs. Feature strings and opener inheritance must not be able
  // to relax the child's process isolation.
  webPreferences: {
    allowRunningInsecureContent: false,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webviewTag: false
  }
} satisfies Electron.BrowserWindowConstructorOptions

type ActiveDownload = {
  downloadId: string
  guestWebContentsId: number
  browserTabId: string | null
  rendererWebContentsId: number | null
  origin: string
  filename: string
  totalBytes: number | null
  mimeType: string | null
  item: BrowserDownloadItem
  savePath: string
  reservationKey: string | null
  receivedBytes: number
  transientState: BrowserDownloadProgressEvent['state']
  terminalEvent: BrowserDownloadFinishedEvent | null
  startedSent: boolean
  cleanup: (() => void) | null
}

function safeOrigin(rawUrl: string): string {
  const external = normalizeExternalBrowserUrl(rawUrl)
  const urlToParse = external ?? rawUrl
  try {
    return new URL(urlToParse).origin
  } catch {
    return external ?? 'unknown'
  }
}

export class BrowserManager {
  private readonly pageRegistry: BrowserPageRegistry

  constructor(pageRegistry = new BrowserPageRegistry()) {
    this.pageRegistry = pageRegistry
  }

  // Why: guest events are pushed to the focused window's WebContents, which
  // paired web/mobile clients do not have. The runtime installs a publisher
  // here so the same payload also reaches `browser.guestEvents.subscribe`.
  private publishGuestEvent: (event: RuntimeBrowserGuestEvent) => void = () => {}
  private settingsResolver:
    | (() => {
        keybindings?: KeybindingOverrides
        mobileEmulatorEnabled?: boolean
      })
    | null = null
  setGuestEventPublisher(publish: (event: RuntimeBrowserGuestEvent) => void): void {
    this.publishGuestEvent = publish
  }

  private readonly webContentsIdByTabId = new Map<string, number>()
  // Why: reverse map enables O(1) guest→tab lookups instead of O(N) linear
  // scans on every mouse event, load failure, permission, and popup event.
  private readonly tabIdByWebContentsId = new Map<number, string>()
  private readonly popupOwnerContextByGuestId = new Map<number, PopupOwnerContext>()
  private readonly shellConnectionIdByGuestId = new Map<number, string>()
  // Why: guest registration is keyed by browser page id, but renderer
  // visibility/focus state is keyed by browser workspace id. Screenshot prep
  // has to bridge that mismatch to activate the right tab before capture.
  private readonly workspaceIdByPageId = new Map<string, string>()
  private readonly sessionProfileIdByPageId = new Map<string, string | null>()
  private readonly rendererWebContentsIdByTabId = new Map<string, number>()
  // Why: chain setViewportOverride calls per tab so rapid toggles don't
  // interleave CDP commands. Without serialization, two concurrent calls can
  // race (e.g. clearDeviceMetricsOverride landing after a later mobile
  // setDeviceMetricsOverride), leaving emulation in an unexpected state.
  private readonly viewportOpsByTabId = new Map<string, Promise<unknown>>()
  private readonly contextMenuCleanupByTabId = new Map<string, () => void>()
  private readonly grabShortcutCleanupByTabId = new Map<string, () => void>()
  private readonly shortcutForwardingCleanupByTabId = new Map<string, () => void>()
  private readonly mouseWheelZoomCleanupByTabId = new Map<string, () => void>()
  private readonly annotationViewportBridgeOpsByTabId = new Map<string, Promise<unknown>>()
  private readonly worktreeIdByTabId = new Map<string, string>()
  private readonly policyAttachedGuestIds = new Set<number>()
  private readonly offscreenGuestIds = new Set<number>()
  private readonly policyCleanupByGuestId = new Map<number, () => void>()
  private readonly guestDocumentScriptInstallers = new Map<
    number,
    (browserPageId?: string) => Promise<void>
  >()
  private readonly guestRegistrationAttemptByTabId = new Map<
    string,
    { token: symbol; webContentsId: number }
  >()
  private readonly clickedLinkFrameNameByGuestId = new Map<number, string>()
  private readonly externalClickedLinkFrameNameByGuestId = new Map<number, string>()
  private readonly loadErrorsByGuestId = new Map<number, BrowserLoadError>()
  // Why: did-start-navigation optimistically hides the overlay, but an aborted
  // nav never commits — stash the cleared error so did-fail-load(-3) can restore
  // it instead of stranding the user on a blank surface.
  private readonly clearedLoadErrorsByGuestId = new Map<number, BrowserLoadError>()
  private browserGuestStateChangedListener: ((worktreeId: string) => void) | null = null
  private certificateTrustController: BrowserCertificateTrustController | null = null
  private shouldForwardDictationShortcut: (() => boolean) | null = null
  private readonly pendingLoadFailuresByGuestId = new Map<
    number,
    { code: number; description: string; validatedUrl: string }
  >()
  private readonly pendingPermissionEventsByGuestId = new Map<number, PendingPermissionEvent[]>()
  private readonly pendingPopupEventsByGuestId = new Map<number, PendingPopupEvent[]>()
  private readonly pendingDownloadIdsByGuestId = new Map<number, string[]>()
  private readonly downloadsById = new Map<string, ActiveDownload>()
  private readonly grabSessionController = new BrowserGrabSessionController()

  setDictationShortcutForwardingPredicate(predicate: (() => boolean) | null): void {
    this.shouldForwardDictationShortcut = predicate
  }

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
  private injectGuestDocumentScripts(guest: Electron.WebContents): () => void {
    let disposed = false
    let reattachTimer: ReturnType<typeof setTimeout> | null = null
    let browserPageId: string | null = null
    let hasInstalledAntiDetection = false
    let installedSessionStoragePageId: string | null = null
    let installChain = Promise.resolve()

    const runInstall = async (): Promise<void> => {
      if (disposed || guest.isDestroyed()) {
        return
      }
      if (!guest.debugger.isAttached()) {
        guest.debugger.attach('1.3')
      }
      await guest.debugger.sendCommand('Page.enable', {})
      if (!hasInstalledAntiDetection) {
        await guest.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
          source: ANTI_DETECTION_SCRIPT
        })
        hasInstalledAntiDetection = true
      }
      if (browserPageId && installedSessionStoragePageId !== browserPageId) {
        await guest.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
          source: buildSessionStoragePersistenceScript(browserPageId)
        })
        installedSessionStoragePageId = browserPageId
      }
    }

    const install = (nextBrowserPageId?: string): Promise<void> => {
      if (nextBrowserPageId) {
        browserPageId = nextBrowserPageId
      }
      const operation = installChain.then(runInstall, runInstall)
      installChain = operation.catch(() => {})
      return operation
    }
    this.guestDocumentScriptInstallers.set(guest.id, install)

    const scheduleInstall = (): void => {
      if (disposed || guest.isDestroyed() || reattachTimer !== null) {
        return
      }
      reattachTimer = setTimeout(() => {
        reattachTimer = null
        void install().catch(() => scheduleInstall())
      }, 500)
    }

    // Why: the CDP proxy and bridge detach the debugger when they stop, which
    // removes new-document scripts. Re-attach so manual browsing keeps both
    // session persistence and anti-detection behavior after agent sessions end.
    const onDetach = (): void => {
      if (!disposed && !guest.isDestroyed() && reattachTimer === null) {
        hasInstalledAntiDetection = false
        installedSessionStoragePageId = null
        scheduleInstall()
      }
    }

    try {
      void install().catch(() => scheduleInstall())
      guest.debugger.on('detach', onDetach)
    } catch {
      /* best-effort */
    }

    return () => {
      disposed = true
      this.guestDocumentScriptInstallers.delete(guest.id)
      if (reattachTimer !== null) {
        clearTimeout(reattachTimer)
        reattachTimer = null
      }
      try {
        guest.debugger.off('detach', onDetach)
      } catch {
        /* guest may already be destroyed */
      }
    }
  }

  private resolveBrowserTabIdForGuestWebContentsId(guestWebContentsId: number): string | null {
    return this.resolvePopupOwnerContext(guestWebContentsId)?.browserTabId ?? null
  }

  private resolvePopupOwnerContext(guestWebContentsId: number): PopupOwnerContext | null {
    const browserTabId = this.tabIdByWebContentsId.get(guestWebContentsId)
    if (browserTabId) {
      return { browserTabId, rootGuestWebContentsId: guestWebContentsId }
    }
    const inherited = this.popupOwnerContextByGuestId.get(guestWebContentsId)
    if (
      inherited &&
      this.webContentsIdByTabId.get(inherited.browserTabId) === inherited.rootGuestWebContentsId
    ) {
      return inherited
    }
    this.popupOwnerContextByGuestId.delete(guestWebContentsId)
    return null
  }

  private resolveRendererForBrowserTab(browserTabId: string): Electron.WebContents | null {
    const rendererWebContentsId = this.rendererWebContentsIdByTabId.get(browserTabId)
    if (!rendererWebContentsId) {
      return null
    }
    const renderer = resolveElectronBrowserWebContents(
      electronBrowserBackendPageId(rendererWebContentsId)
    )
    if (!renderer || renderer.isDestroyed()) {
      return null
    }
    return renderer
  }

  // Why: screenshot sessions target guest page ids, but Yiru's visible browser
  // chrome is keyed by workspace ids. If we activate the page id directly, the
  // webview stays hidden under the terminal pane and Page.captureScreenshot
  // times out even though the guest still exists.
  async ensureWebviewVisible(guestWebContentsId: number): Promise<() => void> {
    const browserPageId = this.resolveBrowserTabIdForGuestWebContentsId(guestWebContentsId)
    if (!browserPageId) {
      return () => {}
    }
    const browserWorkspaceId = this.workspaceIdByPageId.get(browserPageId) ?? browserPageId
    const worktreeId = this.worktreeIdByTabId.get(browserPageId) ?? null
    const renderer = this.resolveRendererForBrowserTab(browserPageId)
    if (!renderer || renderer.isDestroyed()) {
      return () => {}
    }

    const prev = await renderer
      .executeJavaScript(
        `(function() {
          var store = window.__store;
          if (!store) return null;
          var state = store.getState();
          var prevTabType = state.activeTabType;
          var prevActiveWorktreeId = state.activeWorktreeId || null;
          var prevActiveBrowserWorkspaceId = state.activeBrowserTabId || null;
          var prevActiveBrowserPageId = null;
          var prevFocusedGroupTabId = null;
          var targetWorktreeId = ${JSON.stringify(worktreeId)};
          var browserWorkspaceId = ${JSON.stringify(browserWorkspaceId)};
          var browserPageId = ${JSON.stringify(browserPageId)};
          var browserTabsByWorktree = state.browserTabsByWorktree || {};

          if (prevActiveWorktreeId) {
            var prevFocusedGroupId = (state.activeGroupIdByWorktree || {})[prevActiveWorktreeId];
            var prevGroups = (state.groupsByWorktree || {})[prevActiveWorktreeId] || [];
            for (var pg = 0; pg < prevGroups.length; pg++) {
              if (prevGroups[pg].id === prevFocusedGroupId) {
                prevFocusedGroupTabId = prevGroups[pg].activeTabId;
                break;
              }
            }
          }

          if (prevActiveBrowserWorkspaceId) {
            for (var prevWtId in browserTabsByWorktree) {
              var prevBrowserTabs = browserTabsByWorktree[prevWtId] || [];
              for (var pbt = 0; pbt < prevBrowserTabs.length; pbt++) {
                if (prevBrowserTabs[pbt].id === prevActiveBrowserWorkspaceId) {
                  prevActiveBrowserPageId = prevBrowserTabs[pbt].activePageId || null;
                  break;
                }
              }
              if (prevActiveBrowserPageId) break;
            }
          }

          if (
            targetWorktreeId &&
            prevActiveWorktreeId !== targetWorktreeId &&
            typeof state.setActiveWorktree === 'function'
          ) {
            state.setActiveWorktree(targetWorktreeId);
            state = store.getState();
          }

          var foundWorkspace = null;
          for (var wtId in browserTabsByWorktree) {
            var tabs = browserTabsByWorktree[wtId] || [];
            for (var i = 0; i < tabs.length; i++) {
              if (tabs[i].id === browserWorkspaceId) {
                foundWorkspace = tabs[i];
                if (!targetWorktreeId) {
                  targetWorktreeId = wtId;
                }
                break;
              }
            }
            if (foundWorkspace) break;
          }

          var hasTargetPage = false;
          var targetPages = (state.browserPagesByWorkspace || {})[browserWorkspaceId] || [];
          for (var pageIndex = 0; pageIndex < targetPages.length; pageIndex++) {
            if (targetPages[pageIndex].id === browserPageId) {
              hasTargetPage = true;
              break;
            }
          }

          if (foundWorkspace) {
            if (typeof state.setActiveBrowserTab === 'function') {
              state.setActiveBrowserTab(browserWorkspaceId);
              state = store.getState();
            } else {
              var allTabs = state.unifiedTabsByWorktree || {};
              var found = null;
              for (var unifiedWtId in allTabs) {
                var unifiedTabs = allTabs[unifiedWtId] || [];
                for (var unifiedIndex = 0; unifiedIndex < unifiedTabs.length; unifiedIndex++) {
                  if (
                    unifiedTabs[unifiedIndex].contentType === 'browser' &&
                    unifiedTabs[unifiedIndex].entityId === browserWorkspaceId
                  ) {
                    found = unifiedTabs[unifiedIndex];
                    break;
                  }
                }
                if (found) break;
              }
              if (found) {
                state.activateTab(found.id);
              }
              state.setActiveTabType('browser');
              state = store.getState();
            }
            // Why: activating the workspace alone is not enough for screenshot
            // capture when a browser workspace contains multiple pages. The
            // compositor only paints the currently mounted page guest.
            if (
              hasTargetPage &&
              foundWorkspace.activePageId !== browserPageId &&
              typeof state.setActiveBrowserPage === 'function'
            ) {
              state.setActiveBrowserPage(browserWorkspaceId, browserPageId);
              state = store.getState();
            }
          }

          return {
            prevTabType: prevTabType,
            prevActiveWorktreeId: prevActiveWorktreeId,
            prevActiveBrowserWorkspaceId: prevActiveBrowserWorkspaceId,
            prevActiveBrowserPageId: prevActiveBrowserPageId,
            prevFocusedGroupTabId: prevFocusedGroupTabId,
            targetWorktreeId: targetWorktreeId,
            targetBrowserWorkspaceId: foundWorkspace ? browserWorkspaceId : null,
            targetBrowserPageId: foundWorkspace && hasTargetPage ? browserPageId : null
          };
        })()`
      )
      .catch(() => null)

    const needsRestore =
      prev &&
      (prev.prevTabType !== 'browser' ||
        prev.prevActiveWorktreeId !== prev.targetWorktreeId ||
        prev.prevFocusedGroupTabId !== null ||
        prev.prevActiveBrowserWorkspaceId !== prev.targetBrowserWorkspaceId ||
        prev.prevActiveBrowserPageId !== prev.targetBrowserPageId)

    if (!needsRestore) {
      return () => {}
    }

    return () => {
      if (!prev || !renderer || renderer.isDestroyed()) {
        return
      }
      renderer
        .executeJavaScript(
          `(function() {
            var store = window.__store;
            if (!store) return;
            var state = store.getState();
            if (
              ${JSON.stringify(prev?.prevActiveWorktreeId)} &&
              ${JSON.stringify(prev?.prevActiveWorktreeId)} !==
                ${JSON.stringify(prev?.targetWorktreeId)} &&
              typeof state.setActiveWorktree === 'function'
            ) {
              state.setActiveWorktree(${JSON.stringify(prev?.prevActiveWorktreeId)});
              state = store.getState();
            }
            if (
              ${JSON.stringify(prev?.prevActiveBrowserWorkspaceId)} &&
              ${JSON.stringify(prev?.prevActiveBrowserWorkspaceId)} !==
                ${JSON.stringify(prev?.targetBrowserWorkspaceId)} &&
              typeof state.setActiveBrowserTab === 'function'
            ) {
              state.setActiveBrowserTab(${JSON.stringify(prev?.prevActiveBrowserWorkspaceId)});
              state = store.getState();
            }
            if (
              ${JSON.stringify(prev?.prevActiveBrowserWorkspaceId)} &&
              ${JSON.stringify(prev?.prevActiveBrowserPageId)} &&
              ${JSON.stringify(prev?.prevActiveBrowserPageId)} !==
                ${JSON.stringify(prev?.targetBrowserPageId)} &&
              typeof state.setActiveBrowserPage === 'function'
            ) {
              // Why: Yiru remembers the last browser workspace/page even when
              // the user is currently in terminal/editor view. Screenshot prep
              // temporarily switches that hidden browser selection state, so
              // restore it independently of the visible tab type.
              state.setActiveBrowserPage(
                ${JSON.stringify(prev?.prevActiveBrowserWorkspaceId)},
                ${JSON.stringify(prev?.prevActiveBrowserPageId)}
              );
              state = store.getState();
            }
            if (
              ${JSON.stringify(prev?.prevTabType)} !== 'browser' &&
              ${JSON.stringify(prev?.prevFocusedGroupTabId)}
            ) {
              state.activateTab(${JSON.stringify(prev?.prevFocusedGroupTabId)});
            }
            if (${JSON.stringify(prev?.prevTabType)} !== 'browser') {
              state.setActiveTabType(${JSON.stringify(prev?.prevTabType)});
            }
          })()`
        )
        .catch(() => {})
    }
  }

  async acquireAutomationVisibility(browserPageId: string): Promise<() => void> {
    const renderer = this.resolveRendererForBrowserTab(browserPageId)
    if (!renderer || renderer.isDestroyed()) {
      return () => {}
    }

    // Why: agent browser commands need a paintable webview for lazy-loading
    // sites, but must not steal the user's visible Yiru tab/worktree.
    const acquirePromise = renderer
      .executeJavaScript(
        `(async function() {
            var bridge = window.__yiruBrowserAutomationVisibility;
            if (!bridge || typeof bridge.acquire !== 'function') return null;
            return await bridge.acquire(${JSON.stringify(browserPageId)});
          })()`
      )
      .catch(() => null)
    const { value: token, timedOut } = await resolveWithTimeout(
      acquirePromise,
      AUTOMATION_VISIBILITY_ACQUIRE_TIMEOUT_MS,
      null
    )

    if (!isAutomationVisibilityToken(token)) {
      return createNoopRestoreForTimedOutAutomationAcquire(renderer, acquirePromise, timedOut)
    }

    return () => {
      releaseAutomationVisibilityToken(renderer, token)
    }
  }

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
      // without exposing the private frame name to untrusted page scripts.
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
    let allowInitialFileNavigation = true
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
      // Why: a new guest bootstraps through Yiru's inert blank document before
      // loading an explicitly opened local preview. Permit that one transition
      // only while the guest is still blank; after any real navigation, a page
      // must not be able to redirect the guest to file:// and probe the local
      // filesystem.
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
      if (!guest.isDestroyed()) {
        guest.off('will-navigate', navigationGuard)
        guest.off('will-redirect', navigationGuard)
        guest.off('did-start-navigation', didStartNavigationHandler)
        guest.off('did-navigate', didNavigateHandler)
        guest.off('did-fail-load', didFailLoadHandler)
      }
    })
  }

  private createPopupChildWindowWithOriginBar(
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

  private retireStaleGuestWebContents(previousWebContentsId: number): void {
    // Why: a browser page can re-register with a new guest id after Chromium
    // swaps renderer processes. Late events from the dead guest must stop
    // resolving to the live page, or stale download/popup/permission callbacks
    // can be delivered to the wrong session after the swap.
    this.cleanupGuestPolicyAttachment(previousWebContentsId)
    this.tabIdByWebContentsId.delete(previousWebContentsId)
  }

  private cleanupGuestPolicyAttachment(guestWebContentsId: number): void {
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

  async registerGuest({
    browserPageId,
    browserTabId: legacyBrowserTabId,
    workspaceId,
    worktreeId,
    sessionProfileId,
    backendPageId,
    rendererOwnerId,
    shellConnectionId
  }: BrowserGuestRegistration): Promise<boolean> {
    const browserTabId = browserPageId ?? legacyBrowserTabId
    if (!browserTabId) {
      return false
    }
    // Why: re-registering the same browser tab can happen when Chromium swaps
    // or recreates the underlying guest surface. Any active grab is bound to
    // the old guest's listeners and teardown path, so keeping it alive would
    // leave the session attached to a stale webContents until timeout.
    this.cancelGrabOp(browserTabId, 'evicted')

    const previousCleanup = this.contextMenuCleanupByTabId.get(browserTabId)
    if (previousCleanup) {
      previousCleanup()
      this.contextMenuCleanupByTabId.delete(browserTabId)
    }

    const guest = resolveElectronBrowserWebContents(backendPageId)
    if (!guest || guest.isDestroyed()) {
      return false
    }
    const webContentsId = guest.id
    const rendererWebContentsId = Number(
      shellConnectionId.startsWith('electron:')
        ? shellConnectionId.slice('electron:'.length)
        : Number.NaN
    )
    if (!Number.isInteger(rendererWebContentsId) || rendererWebContentsId <= 0) {
      return false
    }
    if (this.shellConnectionIdByGuestId.get(webContentsId) !== shellConnectionId) {
      return false
    }

    // Why: the renderer sends webContentsId, which we must not blindly trust.
    // A compromised renderer could send the main window's own webContentsId,
    // causing us to overwrite its setWindowOpenHandler or attach unintended
    // context menus. Only accept genuine webview guest surfaces.
    if (guest.getType() !== 'webview') {
      return false
    }
    if (!this.policyAttachedGuestIds.has(webContentsId)) {
      // Why: renderer registration is only the second half of the guest setup.
      // Main must only trust guests that already passed attach-time policy
      // installation; otherwise a trusted renderer could point us at some other
      // arbitrary webview and bypass the intended host-window attach boundary.
      return false
    }

    const registrationToken = Symbol(browserTabId)
    this.guestRegistrationAttemptByTabId.set(browserTabId, {
      token: registrationToken,
      webContentsId
    })
    const clearRegistrationAttempt = (): void => {
      if (this.guestRegistrationAttemptByTabId.get(browserTabId)?.token === registrationToken) {
        this.guestRegistrationAttemptByTabId.delete(browserTabId)
      }
    }

    const installGuestDocumentScripts = this.guestDocumentScriptInstallers.get(webContentsId)
    if (!installGuestDocumentScripts) {
      clearRegistrationAttempt()
      return false
    }
    try {
      // Why: the first real navigation is held in the renderer until this
      // resolves, so restoration runs before any site script can read storage.
      await installGuestDocumentScripts(browserTabId)
    } catch {
      clearRegistrationAttempt()
      return false
    }
    if (
      guest.isDestroyed() ||
      this.guestRegistrationAttemptByTabId.get(browserTabId)?.token !== registrationToken
    ) {
      clearRegistrationAttempt()
      return false
    }

    try {
      this.pageRegistry.register(
        createElectronBrowserPageHandle({
          browserPageId: browserTabId,
          backendKind: 'electron-webview',
          rendererOwnerId,
          shellConnectionId,
          webContents: guest
        })
      )
      this.shellConnectionIdByGuestId.set(webContentsId, shellConnectionId)
    } catch {
      clearRegistrationAttempt()
      return false
    }

    const previousWebContentsId = this.webContentsIdByTabId.get(browserTabId)
    if (previousWebContentsId !== undefined && previousWebContentsId !== webContentsId) {
      this.retireStaleGuestWebContents(previousWebContentsId)
    }
    this.webContentsIdByTabId.set(browserTabId, webContentsId)
    this.tabIdByWebContentsId.set(webContentsId, browserTabId)
    if (workspaceId) {
      this.workspaceIdByPageId.set(browserTabId, workspaceId)
    }
    this.sessionProfileIdByPageId.set(browserTabId, sessionProfileId ?? null)
    this.rendererWebContentsIdByTabId.set(browserTabId, rendererWebContentsId)
    if (worktreeId) {
      this.worktreeIdByTabId.set(browserTabId, worktreeId)
    }
    this.certificateTrustController?.onGuestRegistered(webContentsId, browserTabId)

    this.setupContextMenu(browserTabId, guest)
    this.setupGrabShortcut(browserTabId, guest)
    this.setupShortcutForwarding(browserTabId, guest)
    this.setupMouseWheelZoomForwarding(browserTabId, guest)
    this.flushPendingLoadFailure(browserTabId, webContentsId)
    this.flushPendingPermissionEvents(browserTabId, webContentsId)
    this.flushPendingPopupEvents(browserTabId, webContentsId)
    this.flushPendingDownloadRequests(browserTabId, webContentsId)
    clearRegistrationAttempt()
    return true
  }

  unregisterGuest(browserTabId: string, expectedWebContentsId?: number): boolean {
    const registeredWebContentsId = this.webContentsIdByTabId.get(browserTabId)
    if (expectedWebContentsId !== undefined && registeredWebContentsId !== expectedWebContentsId) {
      this.cleanupGuestPolicyAttachment(expectedWebContentsId)
      return false
    }
    // Why: unregistering a guest while a grab is active means the guest is
    // being torn down. Cancel the grab so the renderer gets a clean signal
    // instead of a dangling Promise.
    this.cancelGrabOp(browserTabId, 'evicted')

    // Why: remove the policy listeners attached in attachGuestPolicies so the
    // callbacks (which close over the guest WebContents) do not prevent GC of
    // the underlying Chromium surface after the guest is destroyed.
    const guestWebContentsId = this.webContentsIdByTabId.get(browserTabId)
    if (guestWebContentsId !== undefined) {
      this.cleanupGuestPolicyAttachment(guestWebContentsId)
    }

    const cleanup = this.contextMenuCleanupByTabId.get(browserTabId)
    if (cleanup) {
      cleanup()
      this.contextMenuCleanupByTabId.delete(browserTabId)
    }
    const shortcutCleanup = this.grabShortcutCleanupByTabId.get(browserTabId)
    if (shortcutCleanup) {
      shortcutCleanup()
      this.grabShortcutCleanupByTabId.delete(browserTabId)
    }
    const fwdCleanup = this.shortcutForwardingCleanupByTabId.get(browserTabId)
    if (fwdCleanup) {
      fwdCleanup()
      this.shortcutForwardingCleanupByTabId.delete(browserTabId)
    }
    const mouseWheelZoomCleanup = this.mouseWheelZoomCleanupByTabId.get(browserTabId)
    if (mouseWheelZoomCleanup) {
      mouseWheelZoomCleanup()
      this.mouseWheelZoomCleanupByTabId.delete(browserTabId)
    }
    // Why: browser downloads are transient per-tab chrome. Closing the owning
    // tab must cancel active writes instead of hiding them behind no UI.
    for (const [downloadId, download] of this.downloadsById.entries()) {
      if (download.browserTabId === browserTabId && !download.terminalEvent) {
        this.cancelDownloadInternal(downloadId, 'Tab closed before download completed.')
      }
    }
    const wcId = this.webContentsIdByTabId.get(browserTabId)
    if (wcId !== undefined) {
      this.tabIdByWebContentsId.delete(wcId)
    }
    this.webContentsIdByTabId.delete(browserTabId)
    this.pageRegistry.unregister(
      browserTabId,
      wcId === undefined ? undefined : electronBrowserBackendPageId(wcId)
    )
    const registrationAttempt = this.guestRegistrationAttemptByTabId.get(browserTabId)
    if (!registrationAttempt || registrationAttempt.webContentsId === wcId) {
      this.guestRegistrationAttemptByTabId.delete(browserTabId)
    }
    this.rendererWebContentsIdByTabId.delete(browserTabId)
    this.workspaceIdByPageId.delete(browserTabId)
    this.sessionProfileIdByPageId.delete(browserTabId)
    this.worktreeIdByTabId.delete(browserTabId)
    // Why: drop any pending viewport-op chain for this tab so the Map doesn't
    // retain a resolved promise keyed to a destroyed guest.
    this.viewportOpsByTabId.delete(browserTabId)
    this.annotationViewportBridgeOpsByTabId.delete(browserTabId)
    return true
  }

  unregisterPage(browserPageId: string): void {
    this.unregisterGuest(browserPageId)
  }

  unregisterRendererGuest(browserPageId: string, expectedBackendPageId: string): boolean {
    const expectedWebContentsId = electronBrowserWebContentsId(expectedBackendPageId)
    if (expectedWebContentsId === null) {
      return false
    }
    return this.unregisterGuest(browserPageId, expectedWebContentsId)
  }

  cancelPendingRendererGuestRegistration(
    browserPageId: string,
    expectedBackendPageId: string,
    shellConnectionId: string
  ): boolean {
    const expectedWebContentsId = electronBrowserWebContentsId(expectedBackendPageId)
    if (
      expectedWebContentsId === null ||
      this.shellConnectionIdByGuestId.get(expectedWebContentsId) !== shellConnectionId
    ) {
      return false
    }
    return this.cancelPendingGuestRegistration(browserPageId, expectedWebContentsId)
  }

  cancelPendingGuestRegistration(browserTabId: string, webContentsId: number): boolean {
    const attempt = this.guestRegistrationAttemptByTabId.get(browserTabId)
    if (attempt?.webContentsId !== webContentsId) {
      return false
    }
    this.guestRegistrationAttemptByTabId.delete(browserTabId)
    return true
  }

  // Why: headless yiru serve has no renderer window to mount a <webview>, so its
  // browser pages are backed by main-process offscreen WebContents instead. This
  // registers such a page into the same resolution maps the bridge/screencast/
  // input handlers read, but skips the webview-only guards and the renderer setup
  // (context menu, grab shortcut, etc.) that assume a renderer-hosted guest.
  async registerOffscreenGuest({
    browserPageId,
    worktreeId,
    sessionProfileId,
    webContentsId,
    shellConnectionId
  }: {
    browserPageId: string
    worktreeId?: string
    sessionProfileId?: string | null
    webContentsId: number
    shellConnectionId?: string | null
  }): Promise<boolean> {
    const guest = resolveElectronBrowserWebContents(electronBrowserBackendPageId(webContentsId))
    if (!guest || guest.isDestroyed()) {
      return false
    }
    // Why: offscreen pages have no renderer webview listeners, so main owns
    // their load-failure lifecycle for remote browser chrome.
    this.offscreenGuestIds.add(webContentsId)
    this.attachGuestPolicies(guest)
    const installGuestDocumentScripts = this.guestDocumentScriptInstallers.get(webContentsId)
    if (!installGuestDocumentScripts) {
      return false
    }
    try {
      await installGuestDocumentScripts(browserPageId)
    } catch {
      return false
    }
    if (guest.isDestroyed()) {
      return false
    }
    try {
      this.pageRegistry.register(
        createElectronBrowserPageHandle({
          browserPageId,
          backendKind: 'electron-offscreen',
          rendererOwnerId: null,
          shellConnectionId: shellConnectionId ?? null,
          webContents: guest
        })
      )
    } catch {
      return false
    }

    const previousWebContentsId = this.webContentsIdByTabId.get(browserPageId)
    if (previousWebContentsId !== undefined && previousWebContentsId !== webContentsId) {
      this.retireStaleGuestWebContents(previousWebContentsId)
    }
    this.webContentsIdByTabId.set(browserPageId, webContentsId)
    this.tabIdByWebContentsId.set(webContentsId, browserPageId)
    this.sessionProfileIdByPageId.set(browserPageId, sessionProfileId ?? null)
    if (worktreeId) {
      this.worktreeIdByTabId.set(browserPageId, worktreeId)
    }
    this.certificateTrustController?.onGuestRegistered(webContentsId, browserPageId)
    return true
  }

  unregisterAll(): void {
    // Cancel all active grab ops before tearing down registrations
    this.grabSessionController.cancelAll('evicted')
    for (const downloadId of this.downloadsById.keys()) {
      this.cancelDownloadInternal(downloadId, 'Yiru is shutting down.')
    }
    browserDownloadDestinationReservations.clear()
    for (const browserTabId of this.webContentsIdByTabId.keys()) {
      this.unregisterGuest(browserTabId)
    }
    this.policyAttachedGuestIds.clear()
    this.offscreenGuestIds.clear()
    // Why: unregisterGuest only cleans up guests that were registered (have an
    // entry in webContentsIdByTabId). Guests that went through
    // attachGuestPolicies but were never registered still have cleanup closures
    // here — invoke them so their event listeners are removed before clearing.
    for (const cleanup of this.policyCleanupByGuestId.values()) {
      cleanup()
    }
    this.policyCleanupByGuestId.clear()
    this.clickedLinkFrameNameByGuestId.clear()
    this.externalClickedLinkFrameNameByGuestId.clear()
    this.guestRegistrationAttemptByTabId.clear()
    this.tabIdByWebContentsId.clear()
    this.popupOwnerContextByGuestId.clear()
    this.shellConnectionIdByGuestId.clear()
    this.worktreeIdByTabId.clear()
    this.sessionProfileIdByPageId.clear()
    this.pendingLoadFailuresByGuestId.clear()
    this.loadErrorsByGuestId.clear()
    this.clearedLoadErrorsByGuestId.clear()
    this.pendingPermissionEventsByGuestId.clear()
    this.pendingPopupEventsByGuestId.clear()
    this.pendingDownloadIdsByGuestId.clear()
    this.mouseWheelZoomCleanupByTabId.clear()
    this.annotationViewportBridgeOpsByTabId.clear()
    this.pageRegistry.clear()
  }

  getPage(browserPageId: string): BrowserPageHandle | null {
    return this.pageRegistry.get(browserPageId)
  }

  getPageForWebContentsId(webContentsId: number): BrowserPageHandle | null {
    return this.pageRegistry.getByBackendPageId(electronBrowserBackendPageId(webContentsId))
  }

  getPages(): BrowserPageHandle[] {
    return this.pageRegistry.list()
  }

  getGuestWebContentsId(browserTabId: string): number | null {
    return this.webContentsIdByTabId.get(browserTabId) ?? null
  }

  getWebContentsIdByTabId(): Map<string, number> {
    return this.webContentsIdByTabId
  }

  getWorktreeIdForTab(browserTabId: string): string | undefined {
    return this.worktreeIdByTabId.get(browserTabId)
  }

  getSessionProfileIdForTab(browserTabId: string): string | null {
    return this.sessionProfileIdByPageId.get(browserTabId) ?? null
  }

  getBrowserPageLoadError(browserPageId: string): BrowserLoadError | null {
    const webContentsId = this.webContentsIdByTabId.get(browserPageId)
    return webContentsId === undefined
      ? null
      : (this.loadErrorsByGuestId.get(webContentsId) ?? null)
  }

  getBrowserPageCertificateFailure(browserPageId: string): BrowserCertificateFailure | null {
    return this.certificateTrustController?.getFailure(browserPageId) ?? null
  }

  getManagedBrowserGuestContext(webContentsId: number): ManagedBrowserGuestContext | null {
    if (this.popupOwnerContextByGuestId.has(webContentsId)) {
      return null
    }
    const browserPageId = this.tabIdByWebContentsId.get(webContentsId) ?? null
    const offscreen = this.offscreenGuestIds.has(webContentsId)
    if (!offscreen && !this.policyAttachedGuestIds.has(webContentsId)) {
      return null
    }
    if (!offscreen) {
      const page = this.pageRegistry.getByBackendPageId(electronBrowserBackendPageId(webContentsId))
      if (!page || page.identity.backendKind !== 'electron-webview') {
        return null
      }
    }
    return {
      browserPageId,
      worktreeId: browserPageId ? (this.worktreeIdByTabId.get(browserPageId) ?? null) : null,
      sessionProfileId: browserPageId
        ? (this.sessionProfileIdByPageId.get(browserPageId) ?? null)
        : null,
      owner: offscreen ? 'offscreen' : 'desktop-webview'
    }
  }

  notifyCertificateFailureChanged(
    webContentsId: number,
    failure: BrowserCertificateFailure | null,
    navigationUrl?: string
  ): void {
    if (failure && navigationUrl) {
      const loadError = {
        code: failure.errorCode ?? -1,
        description: failure.error,
        validatedUrl: redactKagiSessionToken(navigationUrl)
      }
      this.loadErrorsByGuestId.set(webContentsId, loadError)
      this.forwardOrQueueGuestLoadFailure(webContentsId, loadError)
    }
    const browserPageId = this.tabIdByWebContentsId.get(webContentsId)
    if (!browserPageId) {
      return
    }
    if (this.offscreenGuestIds.has(webContentsId)) {
      this.notifyBrowserGuestStateChanged(webContentsId)
      return
    }
    this.publishGuestEvent({ type: 'certificateFailureChanged', browserPageId, failure })
  }

  private notifyBrowserGuestStateChanged(webContentsId: number): void {
    if (!this.offscreenGuestIds.has(webContentsId)) {
      return
    }
    const browserPageId = this.tabIdByWebContentsId.get(webContentsId)
    const worktreeId = browserPageId ? this.worktreeIdByTabId.get(browserPageId) : null
    if (worktreeId) {
      // Why: this runs inside an Electron guest event dispatch; the listener
      // synchronously reconciles mobile-session tabs, and an escaping throw would
      // become a fatal uncaught exception (no catch-all main-process guard).
      try {
        this.browserGuestStateChangedListener?.(worktreeId)
      } catch (error) {
        console.error('[browser-manager] browserGuestStateChanged listener failed', error)
      }
    }
  }

  notifyPermissionDenied(args: {
    guestWebContentsId: number
    permission: string
    rawUrl: string
  }): void {
    this.forwardOrQueuePermissionDenied(args.guestWebContentsId, {
      permission: args.permission,
      origin: safeOrigin(args.rawUrl)
    })
  }

  handleGuestWillDownload(args: { guestWebContentsId: number; item: BrowserDownloadItem }): void {
    const { guestWebContentsId, item } = args
    const downloadId = randomUUID()
    const requestedFilename = (() => {
      try {
        return item.getFilename() || 'download'
      } catch {
        return 'download'
      }
    })()
    const totalBytes = (() => {
      try {
        const total = item.getTotalBytes()
        return total > 0 ? total : null
      } catch {
        return null
      }
    })()
    const mimeType = (() => {
      try {
        const mime = item.getMimeType()
        return mime || null
      } catch {
        return null
      }
    })()
    const origin = (() => {
      try {
        return safeOrigin(item.getUrl())
      } catch {
        return 'unknown'
      }
    })()

    const destination = (() => {
      try {
        return browserDownloadDestinationReservations.reserve(requestedFilename)
      } catch (error) {
        console.error('[browser-download] Failed to choose download destination:', error)
        return null
      }
    })()

    const fallbackSavePath = destination?.savePath ?? ''

    const download: ActiveDownload = {
      downloadId,
      guestWebContentsId,
      browserTabId: null,
      rendererWebContentsId: null,
      origin,
      filename: destination?.filename ?? requestedFilename,
      totalBytes,
      mimeType,
      item,
      savePath: fallbackSavePath,
      reservationKey: destination?.reservationKey ?? null,
      receivedBytes: 0,
      transientState: null,
      terminalEvent: null,
      startedSent: false,
      cleanup: null
    }
    this.downloadsById.set(downloadId, download)

    const browserTabId = this.resolveBrowserTabIdForGuestWebContentsId(guestWebContentsId)
    if (browserTabId) {
      this.bindDownloadToTab(downloadId, browserTabId)
    } else {
      const pending = this.pendingDownloadIdsByGuestId.get(guestWebContentsId) ?? []
      pending.push(downloadId)
      this.pendingDownloadIdsByGuestId.set(guestWebContentsId, pending)
    }

    if (!destination) {
      this.finishDownloadInternal(downloadId, 'failed', 'Could not choose a Downloads file name.')
      try {
        item.cancel()
      } catch {
        // Why: without a destination, Chromium must not keep writing invisibly;
        // cancellation remains best-effort after surfacing the failure.
      }
      return
    }

    try {
      item.setSavePath(destination.savePath)
    } catch (error) {
      console.error('[browser-download] Failed to set download destination:', error)
      this.finishDownloadInternal(downloadId, 'failed', 'Failed to set download destination.')
      try {
        item.cancel()
      } catch {
        // Why: failing setSavePath can leave Electron in a partially finalized
        // state; cancellation is best-effort after Yiru has made the UI terminal.
      }
      return
    }

    const updatedHandler = (state: 'progressing' | 'interrupted'): void => {
      download.receivedBytes = this.getDownloadReceivedBytes(download.item)
      download.transientState = state
      this.sendDownloadProgress(download.browserTabId, {
        browserPageId: download.browserTabId ?? undefined,
        downloadId: download.downloadId,
        receivedBytes: download.receivedBytes,
        totalBytes: download.totalBytes,
        state
      })
    }
    const doneHandler = (state: BrowserDownloadDoneState): void => {
      const status: BrowserDownloadFinishedEvent['status'] =
        state === 'completed' ? 'completed' : state === 'cancelled' ? 'canceled' : 'failed'
      this.finishDownloadInternal(
        download.downloadId,
        status,
        status === 'failed'
          ? state === 'interrupted'
            ? 'Download was interrupted.'
            : 'Download failed.'
          : null
      )
    }
    download.cleanup = (): void => {
      try {
        download.item.offUpdated(updatedHandler)
        download.item.offDone(doneHandler)
      } catch {
        // Why: completed DownloadItems can already be finalized when cleanup
        // runs. Cleanup must stay best-effort so UI teardown never crashes main.
      }
    }
    item.onUpdated(updatedHandler)
    item.onceDone(doneHandler)

    if (browserTabId) {
      this.sendDownloadStarted(downloadId)
    }
  }

  cancelDownload(args: { downloadId: string; shellConnectionId: string }): boolean {
    const download = this.downloadsById.get(args.downloadId)
    const pageShellConnectionId = download?.browserTabId
      ? this.pageRegistry.get(download.browserTabId)?.identity.shellConnectionId
      : null
    if (!download || pageShellConnectionId !== args.shellConnectionId) {
      return false
    }
    this.cancelDownloadInternal(args.downloadId, 'Canceled.')
    return true
  }

  // Why: guest browser surfaces are isolated from Yiru's bootstrap preload, so
  // the registered page handle owns the optional backend devtools escape hatch.
  async openDevTools(browserTabId: string): Promise<boolean> {
    const page = this.pageRegistry.get(browserTabId)
    if (!page?.openDevTools) {
      return false
    }
    page.openDevTools()
    return true
  }

  // Why: Electron <webview> guests do not expose Chrome DevTools' device
  // toolbar (Cmd+Shift+M) to the embedding app, so viewport emulation must be
  // driven through CDP directly. We reuse the debugger attachment that
  // injectGuestDocumentScripts already established and never detach it here — doing
  // so would clear Page.addScriptToEvaluateOnNewDocument and other per-guest
  // overrides. Passing override=null clears emulation.
  async setViewportOverride(
    browserTabId: string,
    override: BrowserViewportOverride | null
  ): Promise<boolean> {
    // Why: chain per-tab so rapid toggles (e.g. user clicking presets quickly)
    // don't interleave CDP commands. Each call waits for the previous one to
    // settle, guaranteeing the last-requested override wins rather than whichever
    // sendCommand sequence happens to finish last.
    const prev = this.viewportOpsByTabId.get(browserTabId) ?? Promise.resolve()
    const next = prev
      .catch(() => {})
      .then(() => this.doSetViewportOverrideImpl(browserTabId, override))
    this.viewportOpsByTabId.set(browserTabId, next)
    try {
      return await next
    } finally {
      // Why: only clear if this call's promise is still the tail. A concurrent
      // later call may have already replaced the entry; deleting would drop the
      // chain and break serialization for the next invocation.
      if (this.viewportOpsByTabId.get(browserTabId) === next) {
        this.viewportOpsByTabId.delete(browserTabId)
      }
    }
  }

  async setAnnotationViewportBridge(
    browserTabId: string,
    options: BrowserAnnotationViewportBridgeOptions
  ): Promise<boolean> {
    const prev = this.annotationViewportBridgeOpsByTabId.get(browserTabId) ?? Promise.resolve()
    const next = prev
      .catch(() => {})
      .then(() => this.doSetAnnotationViewportBridgeImpl(browserTabId, options))
    this.annotationViewportBridgeOpsByTabId.set(browserTabId, next)
    try {
      return await next
    } finally {
      if (this.annotationViewportBridgeOpsByTabId.get(browserTabId) === next) {
        this.annotationViewportBridgeOpsByTabId.delete(browserTabId)
      }
    }
  }

  private async doSetAnnotationViewportBridgeImpl(
    browserTabId: string,
    options: BrowserAnnotationViewportBridgeOptions
  ): Promise<boolean> {
    const page = this.pageRegistry.get(browserTabId)
    if (!page) {
      return false
    }
    try {
      // Why: the scroll bridge runs outside the page world so page monkey
      // patches cannot read the per-tab token or tamper with bridge state.
      await evaluateBrowserPageIsolated(page, buildBrowserAnnotationViewportBridgeScript(options))
      return true
    } catch {
      return false
    }
  }

  private async doSetViewportOverrideImpl(
    browserTabId: string,
    override: BrowserViewportOverride | null
  ): Promise<boolean> {
    const page = this.pageRegistry.get(browserTabId)
    if (!page) {
      return false
    }
    let dbg: BrowserPageCdpLease
    try {
      dbg = page.acquireCdp()
    } catch (err) {
      // Why: DevTools being open on the guest causes attach to throw with
      // "Another debugger is already attached". Silently returning false made
      // this failure mode undiagnosable — surface it via the logger with enough
      // context (tab + webContents ids) to correlate with user reports.
      console.warn('[browser-manager] setViewportOverride: failed to attach debugger', {
        browserTabId,
        backendPageId: page.identity.backendPageId,
        error: err instanceof Error ? err.message : String(err)
      })
      return false
    }

    try {
      if (override) {
        await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
          width: override.width,
          height: override.height,
          deviceScaleFactor: override.deviceScaleFactor,
          mobile: override.mobile
        })
        await dbg.sendCommand('Emulation.setTouchEmulationEnabled', {
          enabled: override.mobile,
          maxTouchPoints: override.mobile ? 5 : 0
        })
        if (override.mobile) {
          const chromeMajor = extractChromeMajor(cleanElectronUserAgent(page.getUserAgent()))
          // Why: pass userAgentMetadata alongside the mobile UA string so
          // sec-ch-ua-mobile / sec-ch-ua-platform client hints match. Without
          // it, session-level desktop client-hints leak through and create a
          // UA/CH mismatch that bot-detection (Cloudflare, Turnstile) flags.
          await dbg.sendCommand('Emulation.setUserAgentOverride', {
            userAgent: buildMobileUserAgent(chromeMajor),
            userAgentMetadata: {
              brands: [
                { brand: 'Google Chrome', version: chromeMajor },
                { brand: 'Chromium', version: chromeMajor },
                { brand: 'Not/A)Brand', version: '24' }
              ],
              fullVersionList: [
                { brand: 'Google Chrome', version: `${chromeMajor}.0.0.0` },
                { brand: 'Chromium', version: `${chromeMajor}.0.0.0` },
                { brand: 'Not/A)Brand', version: '24.0.0.0' }
              ],
              fullVersion: `${chromeMajor}.0.0.0`,
              platform: 'iOS',
              platformVersion: '17.0',
              architecture: '',
              model: 'iPhone',
              mobile: true
            }
          })
        } else {
          // Why: desktop presets still need the clean (non-Electron) UA so
          // Cloudflare/Turnstile don't flag the session. Passing the cleaned
          // real UA keeps sec-ch-ua consistent with the override.
          await dbg.sendCommand('Emulation.setUserAgentOverride', {
            userAgent: cleanElectronUserAgent(page.getUserAgent())
          })
        }
      } else {
        await dbg.sendCommand('Emulation.clearDeviceMetricsOverride', {})
        await dbg.sendCommand('Emulation.setTouchEmulationEnabled', {
          enabled: false,
          maxTouchPoints: 0
        })
        // Why: passing an empty string restores the session default UA.
        await dbg.sendCommand('Emulation.setUserAgentOverride', { userAgent: '' })
      }
      return true
    } catch {
      return false
    } finally {
      dbg.release()
    }
  }

  // ---------------------------------------------------------------------------
  // Browser Context Grab — main-owned operations
  // ---------------------------------------------------------------------------

  /** Validates that an opaque shell connection owns the registered page. */
  getAuthorizedPage(browserTabId: string, shellConnectionId: string): BrowserPageHandle | null {
    const page = this.pageRegistry.get(browserTabId)
    if (!page || page.identity.shellConnectionId !== shellConnectionId) {
      return null
    }
    return page
  }

  /** Returns true if a grab operation is currently active for this tab. */
  hasActiveGrabOp(browserTabId: string): boolean {
    return this.grabSessionController.hasActiveGrabOp(browserTabId)
  }

  /**
   * Enable or disable grab mode for a browser tab. When enabled, injects the
   * overlay runtime into the guest. When disabled, cancels any active grab op.
   */
  async setGrabMode(
    browserTabId: string,
    enabled: boolean,
    page: BrowserPageHandle
  ): Promise<boolean> {
    if (!enabled) {
      this.cancelGrabOp(browserTabId, 'user')
      return true
    }
    // Why: injecting the overlay runtime eagerly on arm lets the hover UI
    // appear instantly when the user starts moving the pointer, rather than
    // adding a visible delay between "click Grab" and "overlay appears".
    // The runtime is idempotent — re-injection on the same page is safe.
    try {
      await evaluateBrowserPage(page, buildGuestOverlayScript('arm'))
      return true
    } catch {
      return false
    }
  }

  /**
   * Await a single grab selection on the given tab. Returns a Promise that
   * resolves exactly once when the user clicks, cancels, or an error occurs.
   *
   * Why the click is handled in-guest rather than via main-side interception:
   * Electron's `before-input-event` only fires for keyboard events, not mouse
   * events on guest webContents. The design doc anticipated a main-owned
   * interceptor, but the spike showed this API gap. The fallback (documented
   * in the design doc) is to let the guest overlay's full-viewport hit-catcher
   * consume the click. The overlay calls `stopPropagation()` and
   * `preventDefault()` so the page underneath does not receive the event.
   * This is not a perfect guarantee (capture-phase listeners on window may
   * still fire), but it covers the vast majority of sites.
   */
  awaitGrabSelection(
    browserTabId: string,
    opId: string,
    page: BrowserPageHandle
  ): Promise<BrowserGrabResult> {
    return this.grabSessionController.awaitGrabSelection(browserTabId, opId, page)
  }

  /**
   * Cancel an active grab operation for the given tab.
   */
  cancelGrabOp(browserTabId: string, reason: BrowserGrabCancelReason): void {
    this.grabSessionController.cancelGrabOp(browserTabId, reason)
  }

  /**
   * Capture a screenshot of the guest surface and optionally crop it to
   * the given CSS-pixel rect.
   */
  async captureSelectionScreenshot(
    _browserTabId: string,
    rect: BrowserGrabRect,
    page: BrowserPageHandle
  ): Promise<BrowserGrabScreenshot | null> {
    return captureGrabSelectionScreenshot(rect, page)
  }

  /**
   * Extract the payload for the currently hovered element without disrupting
   * the active grab overlay or awaitClick listener. Used by keyboard shortcuts
   * that let the user copy content while hovering, before clicking.
   */
  async extractHoverPayload(
    _browserTabId: string,
    page: BrowserPageHandle
  ): Promise<BrowserGrabPayload | null> {
    try {
      const rawPayload = await evaluateBrowserPage(page, buildGuestOverlayScript('extractHover'))
      if (!rawPayload || typeof rawPayload !== 'object') {
        return null
      }
      return clampGrabPayload(rawPayload)
    } catch {
      return null
    }
  }

  private setupContextMenu(browserTabId: string, guest: Electron.WebContents): void {
    this.contextMenuCleanupByTabId.set(
      browserTabId,
      setupGuestContextMenu({
        browserTabId,
        guest,
        resolveRenderer: (tabId) => this.resolveRendererForBrowserTab(tabId)
      })
    )
  }

  // Why: browser grab mode intentionally uses Cmd/Ctrl+C as its entry
  // gesture, but a focused webview guest is a separate Chromium process so
  // the renderer's window-level keydown handler never sees that shortcut.
  // Only forward the chord when Chromium would not perform a normal copy:
  // no editable element is focused and there is no selected text. That keeps
  // native page copy working while still making the grab shortcut reachable
  // from focused web content.
  private setupGrabShortcut(browserTabId: string, guest: Electron.WebContents): void {
    const previousCleanup = this.grabShortcutCleanupByTabId.get(browserTabId)
    if (previousCleanup) {
      previousCleanup()
      this.grabShortcutCleanupByTabId.delete(browserTabId)
    }

    this.grabShortcutCleanupByTabId.set(
      browserTabId,
      setupGrabShortcutForwarding({
        browserTabId,
        guest,
        resolveRenderer: (tabId) => this.resolveRendererForBrowserTab(tabId),
        hasActiveGrabOp: (tabId) => this.hasActiveGrabOp(tabId),
        getKeybindings: () => this.settingsResolver?.().keybindings
      })
    )
  }

  // Why: a focused webview guest is a separate Chromium process — keyboard
  // events go to the guest's own webContents and never fire the renderer's
  // window-level keydown handler or the main window's before-input-event.
  // Intercept common app shortcuts on the guest and forward them to the
  // renderer so they work consistently regardless of which surface has focus.
  private setupShortcutForwarding(browserTabId: string, guest: Electron.WebContents): void {
    const previousCleanup = this.shortcutForwardingCleanupByTabId.get(browserTabId)
    if (previousCleanup) {
      previousCleanup()
      this.shortcutForwardingCleanupByTabId.delete(browserTabId)
    }

    this.shortcutForwardingCleanupByTabId.set(
      browserTabId,
      setupGuestShortcutForwarding({
        browserTabId,
        guest,
        resolveRenderer: (tabId) => this.resolveRendererForBrowserTab(tabId),
        shouldForwardDictationShortcut: () => this.shouldForwardDictationShortcut?.() ?? false,
        isMobileEmulatorEnabled: () => this.settingsResolver?.().mobileEmulatorEnabled !== false,
        getKeybindings: () => this.settingsResolver?.().keybindings
      })
    )
  }

  private setupMouseWheelZoomForwarding(browserTabId: string, guest: Electron.WebContents): void {
    const previousCleanup = this.mouseWheelZoomCleanupByTabId.get(browserTabId)
    if (previousCleanup) {
      previousCleanup()
      this.mouseWheelZoomCleanupByTabId.delete(browserTabId)
    }

    this.mouseWheelZoomCleanupByTabId.set(
      browserTabId,
      setupGuestMouseWheelZoomForwarding({
        browserTabId,
        guest,
        resolveRenderer: (tabId) => this.resolveRendererForBrowserTab(tabId)
      })
    )
  }

  private forwardOrQueueGuestLoadFailure(
    guestWebContentsId: number,
    loadError: { code: number; description: string; validatedUrl: string }
  ): void {
    const browserTabId = this.tabIdByWebContentsId.get(guestWebContentsId)
    if (!browserTabId) {
      // Why: some localhost failures happen before the renderer finishes
      // registering which tab owns this guest. Queue the failure by guest ID so
      // registerGuest can replay it instead of silently losing the error state.
      this.pendingLoadFailuresByGuestId.set(guestWebContentsId, loadError)
      return
    }
    this.sendGuestLoadFailure(browserTabId, loadError)
  }

  private forwardOrQueuePermissionDenied(
    guestWebContentsId: number,
    event: PendingPermissionEvent
  ): void {
    const browserTabId = this.resolveBrowserTabIdForGuestWebContentsId(guestWebContentsId)
    if (!browserTabId) {
      const pending = this.pendingPermissionEventsByGuestId.get(guestWebContentsId) ?? []
      pending.push(event)
      if (pending.length > 5) {
        pending.shift()
      }
      this.pendingPermissionEventsByGuestId.set(guestWebContentsId, pending)
      return
    }
    this.sendPermissionDenied(browserTabId, event)
  }

  private flushPendingPermissionEvents(browserTabId: string, guestWebContentsId: number): void {
    const pending = this.pendingPermissionEventsByGuestId.get(guestWebContentsId)
    if (!pending?.length) {
      return
    }
    this.pendingPermissionEventsByGuestId.delete(guestWebContentsId)
    for (const event of pending) {
      this.sendPermissionDenied(browserTabId, event)
    }
  }

  private sendPermissionDenied(browserTabId: string, event: PendingPermissionEvent): void {
    this.publishGuestEvent({ type: 'permissionDenied', browserPageId: browserTabId, ...event })
  }

  private forwardOrQueuePopupEvent(guestWebContentsId: number, event: PendingPopupEvent): void {
    const browserTabId = this.resolveBrowserTabIdForGuestWebContentsId(guestWebContentsId)
    if (!browserTabId) {
      const pending = this.pendingPopupEventsByGuestId.get(guestWebContentsId) ?? []
      pending.push(event)
      if (pending.length > 5) {
        pending.shift()
      }
      this.pendingPopupEventsByGuestId.set(guestWebContentsId, pending)
      return
    }
    this.sendPopupEvent(browserTabId, event)
  }

  private flushPendingPopupEvents(browserTabId: string, guestWebContentsId: number): void {
    const pending = this.pendingPopupEventsByGuestId.get(guestWebContentsId)
    if (!pending?.length) {
      return
    }
    this.pendingPopupEventsByGuestId.delete(guestWebContentsId)
    for (const event of pending) {
      this.sendPopupEvent(browserTabId, event)
    }
  }

  private sendPopupEvent(browserTabId: string, event: PendingPopupEvent): void {
    this.publishGuestEvent({ type: 'popup', browserPageId: browserTabId, ...event })
  }

  private bindDownloadToTab(downloadId: string, browserTabId: string): void {
    const download = this.downloadsById.get(downloadId)
    if (!download) {
      return
    }
    download.browserTabId = browserTabId
    download.rendererWebContentsId = this.rendererWebContentsIdByTabId.get(browserTabId) ?? null
  }

  private flushPendingDownloadRequests(browserTabId: string, guestWebContentsId: number): void {
    const pending = this.pendingDownloadIdsByGuestId.get(guestWebContentsId)
    if (!pending?.length) {
      return
    }
    this.pendingDownloadIdsByGuestId.delete(guestWebContentsId)
    for (const downloadId of pending) {
      this.bindDownloadToTab(downloadId, browserTabId)
      this.flushDownloadSnapshot(downloadId)
    }
  }

  private flushDownloadSnapshot(downloadId: string): void {
    const download = this.downloadsById.get(downloadId)
    if (!download) {
      return
    }
    this.sendDownloadStarted(downloadId)
    if (download.receivedBytes > 0 || download.transientState) {
      this.sendDownloadProgress(download.browserTabId, {
        browserPageId: download.browserTabId ?? undefined,
        downloadId: download.downloadId,
        receivedBytes: download.receivedBytes,
        totalBytes: download.totalBytes,
        state: download.transientState
      })
    }
    if (download.terminalEvent) {
      this.sendDownloadFinished(download.browserTabId, {
        ...download.terminalEvent,
        browserPageId: download.browserTabId ?? undefined
      })
      this.downloadsById.delete(downloadId)
    }
  }

  private sendDownloadStarted(downloadId: string): void {
    const download = this.downloadsById.get(downloadId)
    if (!download?.browserTabId) {
      return
    }
    if (download.startedSent) {
      return
    }
    this.publishGuestEvent({
      type: 'downloadRequested',
      browserPageId: download.browserTabId,
      downloadId: download.downloadId,
      origin: download.origin,
      filename: download.filename,
      totalBytes: download.totalBytes,
      mimeType: download.mimeType,
      savePath: download.savePath,
      status: 'downloading'
    })
    download.startedSent = true
  }

  private sendDownloadProgress(
    browserTabId: string | null,
    payload: BrowserDownloadProgressEvent
  ): void {
    if (!browserTabId) {
      return
    }
    this.publishGuestEvent({ type: 'downloadProgress', ...payload })
  }

  private sendDownloadFinished(
    browserTabId: string | null,
    payload: BrowserDownloadFinishedEvent
  ): void {
    if (!browserTabId) {
      return
    }
    this.publishGuestEvent({ type: 'downloadFinished', ...payload })
  }

  private cancelDownloadInternal(downloadId: string, reason: string): void {
    const download = this.downloadsById.get(downloadId)
    if (!download) {
      return
    }

    if (download.cleanup) {
      download.cleanup()
      download.cleanup = null
    }
    const shouldSendCancel = !download.terminalEvent

    try {
      download.item.cancel()
    } catch {
      // Why: DownloadItem.cancel can throw after the item has already
      // finalized. Cleanup here is best-effort because the UI state is the
      // source of truth for whether Yiru still considers the request active.
    }

    if (shouldSendCancel) {
      this.finishDownloadInternal(downloadId, 'canceled', reason || null)
      return
    }

    this.downloadsById.delete(downloadId)
  }

  private finishDownloadInternal(
    downloadId: string,
    status: BrowserDownloadFinishedEvent['status'],
    error: string | null
  ): void {
    const download = this.downloadsById.get(downloadId)
    if (!download || download.terminalEvent) {
      return
    }

    if (download.cleanup) {
      download.cleanup()
      download.cleanup = null
    }
    browserDownloadDestinationReservations.release(download.reservationKey)
    download.reservationKey = null
    const event: BrowserDownloadFinishedEvent = {
      browserPageId: download.browserTabId ?? undefined,
      downloadId: download.downloadId,
      status,
      savePath: download.savePath || null,
      error
    }
    download.terminalEvent = event
    if (download.browserTabId) {
      this.sendDownloadStarted(downloadId)
      this.sendDownloadFinished(download.browserTabId, event)
      this.downloadsById.delete(downloadId)
    }
  }

  private cancelPendingDownloadsForGuest(guestWebContentsId: number): void {
    const pending = this.pendingDownloadIdsByGuestId.get(guestWebContentsId)
    this.pendingDownloadIdsByGuestId.delete(guestWebContentsId)
    if (!pending?.length) {
      return
    }
    for (const downloadId of pending) {
      const download = this.downloadsById.get(downloadId)
      if (!download) {
        continue
      }
      if (download.terminalEvent) {
        this.downloadsById.delete(downloadId)
        continue
      }
      this.cancelDownloadInternal(downloadId, 'Browser page closed before download could be shown.')
      const afterCancel = this.downloadsById.get(downloadId)
      if (afterCancel?.terminalEvent && !afterCancel.browserTabId) {
        this.downloadsById.delete(downloadId)
      }
    }
  }

  private getDownloadReceivedBytes(item: BrowserDownloadItem): number {
    try {
      return Math.max(0, item.getReceivedBytes())
    } catch {
      return 0
    }
  }

  private flushPendingLoadFailure(browserTabId: string, guestWebContentsId: number): void {
    const pending = this.pendingLoadFailuresByGuestId.get(guestWebContentsId)
    if (!pending) {
      return
    }
    this.pendingLoadFailuresByGuestId.delete(guestWebContentsId)
    this.sendGuestLoadFailure(browserTabId, pending)
  }

  private sendGuestLoadFailure(
    browserTabId: string,
    loadError: { code: number; description: string; validatedUrl: string }
  ): void {
    this.publishGuestEvent({
      type: 'guestLoadFailed',
      browserPageId: browserTabId,
      loadError: { ...loadError, validatedUrl: redactKagiSessionToken(loadError.validatedUrl) }
    })
  }

  private forwardClickedLink(browserTabId: string, rawUrl: string): void {
    const normalizedUrl = normalizeBrowserNavigationUrl(rawUrl)
    if (!normalizedUrl || normalizedUrl === YIRU_BROWSER_BLANK_URL) {
      return
    }
    // Why: the renderer owns both the saved link destination and Yiru's tab
    // model. Main forwards only a validated URL and never creates a blank popup.
    this.publishGuestEvent({
      type: 'openLinkInYiruTab',
      browserPageId: browserTabId,
      url: normalizedUrl
    })
  }
}

export const browserManager = new BrowserManager()
export const browserCertificateTrustController = new BrowserCertificateTrustController({
  resolveManagedGuestContext: (webContentsId) =>
    browserManager.getManagedBrowserGuestContext(webContentsId),
  resolveWebContentsIdForPage: (browserPageId) =>
    browserManager.getGuestWebContentsId(browserPageId),
  resolveWebContents: (webContentsId) =>
    resolveElectronBrowserWebContents(electronBrowserBackendPageId(webContentsId)),
  onFailureChanged: (webContentsId, failure, navigationUrl) =>
    browserManager.notifyCertificateFailureChanged(webContentsId, failure, navigationUrl)
})
browserManager.setCertificateTrustController(browserCertificateTrustController)
