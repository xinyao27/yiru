import { redactKagiSessionToken } from '~shared/browser/url'
import type { BrowserCertificateFailure, BrowserLoadError } from '~shared/types'

import type { ManagedBrowserGuestContext } from './certificate-trust-controller'
import { browserDownloadDestinationReservations } from './download-destination'
import { BrowserManagerRegistry } from './manager-registry'
import {
  createElectronBrowserPageHandle,
  electronBrowserBackendPageId,
  resolveElectronBrowserWebContents
} from './page/electron-handle'
import type { BrowserPageHandle } from './page/handle'

export abstract class BrowserManagerOffscreen extends BrowserManagerRegistry {
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

  protected notifyBrowserGuestStateChanged(webContentsId: number): void {
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
}
