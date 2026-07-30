import { randomUUID } from 'node:crypto'

import { BrowserWindow } from 'electron'

import { YIRU_BROWSER_GUEST_WEB_PREFERENCES } from '../../shared/browser/guest-web-preferences'
import {
  buildSessionStoragePersistenceScript,
  YIRU_PERSIST_SESSION_STORAGE_EXPRESSION
} from '../../shared/browser/session-storage-persistence'
import { YIRU_BROWSER_PARTITION } from '../../shared/constants'
import type { BrowserBackend, BrowserBackendCreateTab } from './backend'
import type { BrowserManager } from './manager'
import { browserSessionRegistry } from './session-registry'

// Why: headless yiru serve has no renderer window to host a <webview>, so each
// browser page is backed by a main-process offscreen BrowserWindow. The window
// is never shown — it exists only so its WebContents can be driven over CDP and
// streamed via the existing screencast path. Verified on macOS and on headless
// Linux under Xvfb (Electron --headless segfaults; a virtual display is
// required there — provisioned in the serve image, not by this code).

const DEFAULT_VIEWPORT_WIDTH = 1280
const DEFAULT_VIEWPORT_HEIGHT = 800
const LOAD_TIMEOUT_MS = 30_000
const SESSION_STORAGE_PERSIST_TIMEOUT_MS = 200

export class OffscreenBrowserBackend implements BrowserBackend {
  private readonly windowsByPageId = new Map<string, BrowserWindow>()

  constructor(private readonly browserManager: BrowserManager) {}

  async createTab(params: BrowserBackendCreateTab): Promise<{ browserPageId: string }> {
    const browserPageId = params.browserPageId ?? randomUUID()
    const existingWindow = this.windowsByPageId.get(browserPageId)
    if (existingWindow && !existingWindow.isDestroyed()) {
      throw new Error('Browser page already exists.')
    }
    if (existingWindow) {
      this.windowsByPageId.delete(browserPageId)
    }
    // Why: profiles map to Electron partitions; using the profile's partition
    // makes cookies/storage persist in the same SQLite DB the desktop path uses.
    const profile = params.profileId
      ? browserSessionRegistry.getProfile(params.profileId)
      : browserSessionRegistry.getDefaultProfile()
    const partition = profile?.partition ?? YIRU_BROWSER_PARTITION

    const win = new BrowserWindow({
      show: false,
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT,
      webPreferences: {
        // Why: offscreen pages are the SSH/headless browser backend; keep their
        // HTML fullscreen behavior aligned with desktop <webview> guests.
        ...YIRU_BROWSER_GUEST_WEB_PREFERENCES,
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.windowsByPageId.set(browserPageId, win)
    const webContentsId = win.webContents.id

    // Why: if the offscreen window is destroyed out from under us (crash, app
    // teardown), drop the registry entry so commands fail cleanly instead of
    // resolving a dead WebContents.
    win.webContents.once('destroyed', () => {
      if (this.windowsByPageId.get(browserPageId) === win) {
        this.windowsByPageId.delete(browserPageId)
      }
      this.browserManager.unregisterGuest(browserPageId, webContentsId)
    })

    // Why: only the pre-document script registration is awaited; navigation
    // remains asynchronous so a slow or failed site does not delay tab creation.
    const registered = await this.browserManager.registerOffscreenGuest({
      browserPageId,
      worktreeId: params.worktreeId,
      sessionProfileId: profile?.id ?? null,
      webContentsId
    })
    if (!registered) {
      this.windowsByPageId.delete(browserPageId)
      win.destroy()
      throw new Error('Could not initialize browser page persistence.')
    }

    const url = params.url || 'about:blank'
    void this.loadUrl(win, url).catch((error) => {
      console.warn(
        '[offscreen-browser] page load failed:',
        error instanceof Error ? error.message : String(error)
      )
    })

    return { browserPageId }
  }

  async closeTab(browserPageId: string): Promise<void> {
    const win = this.windowsByPageId.get(browserPageId)
    const webContentsId = win && !win.isDestroyed() ? win.webContents.id : undefined
    this.windowsByPageId.delete(browserPageId)
    if (win && !win.isDestroyed()) {
      await this.persistSessionStorageBeforeClose(browserPageId, win)
    }
    this.browserManager.unregisterGuest(browserPageId, webContentsId)
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
  }

  getWebContentsId(browserPageId: string): number | null {
    const win = this.windowsByPageId.get(browserPageId)
    return win && !win.isDestroyed() ? win.webContents.id : null
  }

  async destroyAll(): Promise<void> {
    const windows = [...this.windowsByPageId]
    this.windowsByPageId.clear()
    await Promise.allSettled(
      windows.map(async ([pageId, win]) => {
        const webContentsId = win.webContents.id
        if (!win.isDestroyed()) {
          await this.persistSessionStorageBeforeClose(pageId, win)
        }
        this.browserManager.unregisterGuest(pageId, webContentsId)
        if (!win.isDestroyed()) {
          win.destroy()
        }
      })
    )
  }

  private async persistSessionStorageBeforeClose(
    browserPageId: string,
    win: BrowserWindow
  ): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, SESSION_STORAGE_PERSIST_TIMEOUT_MS)
    })
    try {
      await Promise.race([
        win.webContents
          .executeJavaScript(
            `${buildSessionStoragePersistenceScript(browserPageId, false)};${YIRU_PERSIST_SESSION_STORAGE_EXPRESSION}`
          )
          .then(() => {}),
        timeout
      ])
    } catch {
      // Why: a crashed offscreen page has no remaining storage to snapshot.
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }

  private async loadUrl(win: BrowserWindow, url: string): Promise<void> {
    const wc = win.webContents
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        // Why: about:blank and slow pages can resolve via timeout without a
        // did-finish-load; treat that as success so the tab is still operable.
        resolve()
      }, LOAD_TIMEOUT_MS)

      const onFinish = (): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        resolve()
      }
      const onFail = (
        _e: unknown,
        errorCode: number,
        errorDescription: string,
        _validatedURL: string,
        isMainFrame: boolean
      ): void => {
        // Why: subframe/iframe (e.g. ad/tracker) load failures also fire
        // did-fail-load. Only the main frame failing means the page itself
        // failed; ignore the rest or an otherwise-usable page gets rejected.
        if (!isMainFrame) {
          return
        }
        if (settled) {
          return
        }
        settled = true
        cleanup()
        // Why: aborted loads (-3) happen on redirects/SPA navigations and are not
        // real failures; the page is still usable.
        if (errorCode === -3) {
          resolve()
          return
        }
        reject(new Error(`${errorDescription} (${errorCode})`))
      }
      const cleanup = (): void => {
        clearTimeout(timer)
        wc.removeListener('did-finish-load', onFinish)
        wc.removeListener('did-fail-load', onFail)
      }

      wc.on('did-finish-load', onFinish)
      wc.on('did-fail-load', onFail)
      void wc.loadURL(url).catch(() => {
        // loadURL rejects on aborted navigations; did-fail-load handles the rest.
      })
    })
  }
}
