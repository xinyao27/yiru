import { browserManager } from './manager'
import { hasSystemMediaAccess, requestSystemMediaAccess } from './media-access'
import { resolveBrowserSession, type BrowserSession } from './session'
import { isAutoGrantedBrowserSessionPermission } from './session-permission-policy'
import type { BrowserSessionPoliciesPort } from './session-registry'
import { cleanElectronUserAgent, setupClientHintsOverride } from './session-ua'
import {
  allowsBrowserWebAuthnPermission,
  clearBrowserWebAuthnAccessHandlers,
  installBrowserWebAuthnAccessHandlers
} from './webauthn-access'

type ConfiguredBrowserSession = {
  session: BrowserSession
  stopWatchingDownloads: () => void
}

// Why: every browser partition must receive one identical, deny-by-default
// policy bundle before it can be admitted to the renderer partition allowlist.
export class BrowserSessionPolicies implements BrowserSessionPoliciesPort {
  private readonly configuredByPartition = new Map<string, ConfiguredBrowserSession>()

  get(partition: string): BrowserSession | null {
    return this.configuredByPartition.get(partition)?.session ?? null
  }

  install(partition: string): BrowserSession | null {
    const existing = this.configuredByPartition.get(partition)
    if (existing) {
      return existing.session
    }
    const session = resolveBrowserSession(partition)
    if (!session) {
      return null
    }

    browserManager.installCertificateRequestGuard(session)
    const cleanUserAgent = cleanElectronUserAgent(session.getUserAgent())
    session.setUserAgent(cleanUserAgent)
    setupClientHintsOverride(session, cleanUserAgent)
    session.setPermissionRequestHandler((webContents, permission, callback, details) => {
      // Why: the session grant is nested inside the host OS media grant. A
      // missing host provider denies the request instead of claiming access.
      if (permission === 'media') {
        void requestSystemMediaAccess(details).then(
          (granted) => {
            if (!granted) {
              browserManager.notifyPermissionDenied({
                guestWebContentsId: webContents.id,
                permission,
                rawUrl: webContents.getUrl()
              })
            }
            callback(granted)
          },
          (error: unknown) => {
            console.error('[permissions] Browser media access failed:', error)
            browserManager.notifyPermissionDenied({
              guestWebContentsId: webContents.id,
              permission,
              rawUrl: webContents.getUrl()
            })
            callback(false)
          }
        )
        return
      }
      const allowed = isAutoGrantedBrowserSessionPermission(permission)
      if (!allowed) {
        browserManager.notifyPermissionDenied({
          guestWebContentsId: webContents.id,
          permission,
          rawUrl: webContents.getUrl()
        })
      }
      callback(allowed)
    })
    session.setPermissionCheckHandler((permission, details) => {
      if (permission === 'media') {
        return hasSystemMediaAccess(details.mediaType)
      }
      if (allowsBrowserWebAuthnPermission(permission, details)) {
        return true
      }
      return isAutoGrantedBrowserSessionPermission(permission)
    })
    installBrowserWebAuthnAccessHandlers(session)
    session.denyDisplayMediaRequests()
    const stopWatchingDownloads = session.watchDownloads((item, webContentsId) => {
      browserManager.handleGuestWillDownload({ guestWebContentsId: webContentsId, item })
    })
    this.configuredByPartition.set(partition, { session, stopWatchingDownloads })
    return session
  }

  remove(partition: string): void {
    const configured = this.configuredByPartition.get(partition)
    if (!configured) {
      return
    }
    this.configuredByPartition.delete(partition)
    configured.stopWatchingDownloads()
    browserManager.removeCertificateRequestGuard(configured.session)
    clearBrowserWebAuthnAccessHandlers(configured.session)
    configured.session.setPermissionRequestHandler(null)
    configured.session.setPermissionCheckHandler(null)
    configured.session.clearDisplayMediaRequestHandler()
  }
}
