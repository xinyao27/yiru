import { BrowserCertificateTrustController } from './certificate-trust-controller'
import { BrowserManager } from './manager-download-events'
import {
  electronBrowserBackendPageId,
  resolveElectronBrowserWebContents
} from './page/electron-handle'

export type { BrowserGuestRegistration } from './manager-foundation'
export { BrowserManager }

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
