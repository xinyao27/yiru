import type { BrowserGuestRegistration } from './manager-foundation'
import { BrowserManagerNavigation } from './manager-navigation'
import {
  createElectronBrowserPageHandle,
  electronBrowserBackendPageId,
  electronBrowserWebContentsId,
  resolveElectronBrowserWebContents
} from './page/electron-handle'

export abstract class BrowserManagerRegistry extends BrowserManagerNavigation {
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
      // Why: bind the document bridge to the stable page id before exposing the
      // guest to browser automation or any later navigation.
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
}
