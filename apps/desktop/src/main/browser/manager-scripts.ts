import { buildSessionStoragePersistenceScript } from '~shared/browser/session-storage-persistence'

import { ANTI_DETECTION_SCRIPT } from './anti-detection'
import { BrowserManagerFoundation } from './manager-base'
import type { PopupOwnerContext } from './manager-foundation'
import {
  electronBrowserBackendPageId,
  resolveElectronBrowserWebContents
} from './page/electron-handle'

export abstract class BrowserManagerScripts extends BrowserManagerFoundation {
  protected injectGuestDocumentScripts(guest: Electron.WebContents): () => void {
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

  protected resolveBrowserTabIdForGuestWebContentsId(guestWebContentsId: number): string | null {
    return this.resolvePopupOwnerContext(guestWebContentsId)?.browserTabId ?? null
  }

  protected resolvePopupOwnerContext(guestWebContentsId: number): PopupOwnerContext | null {
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

  protected resolveRendererForBrowserTab(browserTabId: string): Electron.WebContents | null {
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
}
