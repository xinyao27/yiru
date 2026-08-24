import { is } from '@electron-toolkit/utils'
import { shell, type BrowserWindow } from 'electron'
import { browserManager } from '~main/browser/manager'
import { browserSessionRegistry } from '~main/browser/session-registry'
import { electronShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import { YIRU_BROWSER_GUEST_WEB_PREFERENCES } from '~shared/browser/guest-web-preferences'
import { normalizeBrowserNavigationUrl, normalizeExternalBrowserUrl } from '~shared/browser/url'

export function registerWindowNavigationSecurity(mainWindow: BrowserWindow): void {
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = normalizeExternalBrowserUrl(url)
    if (externalUrl) {
      void shell.openExternal(externalUrl)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const src = typeof params.src === 'string' ? params.src : ''
    const normalizedSrc = normalizeBrowserNavigationUrl(src)
    const partition = typeof webPreferences.partition === 'string' ? webPreferences.partition : ''
    if (!normalizedSrc || !browserSessionRegistry.isAllowedPartition(partition)) {
      event.preventDefault()
      return
    }

    delete webPreferences.preload
    delete (webPreferences as Record<string, unknown>).preloadURL
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.enableBlinkFeatures = ''
    webPreferences.disableBlinkFeatures = ''
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    Object.assign(webPreferences, YIRU_BROWSER_GUEST_WEB_PREFERENCES)
    webPreferences.partition = partition
  })

  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    browserManager.attachGuestPolicies(
      guest,
      null,
      electronShellServicesConnectionId(mainWindow.webContents.id)
    )
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const externalUrl = normalizeExternalBrowserUrl(url)
    if (externalUrl) {
      const target = new URL(externalUrl)
      if (is.dev && process.env.ELECTRON_RENDERER_URL) {
        try {
          const allowed = new URL(process.env.ELECTRON_RENDERER_URL)
          if (target.origin === allowed.origin) {
            return
          }
        } catch {
          // Why: malformed development URLs must fail closed like production URLs.
        }
      }
      void shell.openExternal(externalUrl)
    }
    event.preventDefault()
  })
}
