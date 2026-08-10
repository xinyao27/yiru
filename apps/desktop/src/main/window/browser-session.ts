import { session } from 'electron'
import type { Session } from 'electron'

import type {
  BrowserBeforeRequestDetails,
  BrowserBeforeSendHeadersDetails,
  BrowserCookieStore,
  BrowserDownloadItem,
  BrowserPermissionCheckHandler,
  BrowserPermissionRequestHandler,
  BrowserSession,
  BrowserSessionEvent,
  BrowserSelectHidDeviceDetails,
  BrowserSelectWebAuthnAccountDetails
} from '../browser/session'

type BrowserSelectHidDeviceHandler = Parameters<BrowserSession['setSelectHidDeviceHandler']>[0]
type BrowserSelectWebAuthnAccountHandler = Parameters<
  BrowserSession['setSelectWebAuthnAccountHandler']
>[0]
type ElectronSelectHidDeviceListener = (
  event: Electron.Event,
  details: Electron.SelectHidDeviceDetails,
  callback: (deviceId?: string | null) => void
) => void
type ElectronSelectWebAuthnAccountListener = (
  event: Electron.Event,
  details: Electron.SelectWebauthnAccountDetails,
  callback: (credentialId?: string | null) => void
) => void

function createCookieStore(electronSession: Session): BrowserCookieStore {
  return {
    flush: () => electronSession.cookies.flushStore(),
    remove: (url, name) => electronSession.cookies.remove(url, name),
    set: (cookie) => electronSession.cookies.set(cookie)
  }
}

function createDownloadItem(item: Electron.DownloadItem): BrowserDownloadItem {
  const updatedListeners = new Map<
    (state: 'progressing' | 'interrupted') => void,
    (event: Electron.Event, state: 'progressing' | 'interrupted') => void
  >()
  const doneListeners = new Map<
    (state: 'completed' | 'cancelled' | 'interrupted') => void,
    (event: Electron.Event, state: 'completed' | 'cancelled' | 'interrupted') => void
  >()
  return {
    cancel: () => item.cancel(),
    getFilename: () => item.getFilename(),
    getMimeType: () => item.getMimeType(),
    getReceivedBytes: () => item.getReceivedBytes(),
    getTotalBytes: () => item.getTotalBytes(),
    getUrl: () => item.getURL(),
    offUpdated: (listener) => {
      const electronListener = updatedListeners.get(listener)
      if (electronListener) {
        item.off('updated', electronListener)
        updatedListeners.delete(listener)
      }
    },
    offDone: (listener) => {
      const electronListener = doneListeners.get(listener)
      if (electronListener) {
        item.off('done', electronListener)
        doneListeners.delete(listener)
      }
    },
    onUpdated: (listener) => {
      const electronListener = (_event: Electron.Event, state: 'progressing' | 'interrupted') =>
        listener(state)
      updatedListeners.set(listener, electronListener)
      item.on('updated', electronListener)
    },
    onceDone: (listener) => {
      const electronListener = (
        _event: Electron.Event,
        state: 'completed' | 'cancelled' | 'interrupted'
      ): void => {
        doneListeners.delete(listener)
        listener(state)
      }
      doneListeners.set(listener, electronListener)
      item.once('done', electronListener)
    },
    setSavePath: (path) => item.setSavePath(path)
  }
}

function createBrowserSession(electronSession: Session): BrowserSession {
  let selectHidDeviceListener: ElectronSelectHidDeviceListener | null = null
  let selectWebAuthnAccountListener: ElectronSelectWebAuthnAccountListener | null = null

  const removeSelectHidDeviceHandler = (): void => {
    if (selectHidDeviceListener) {
      electronSession.removeListener('select-hid-device', selectHidDeviceListener)
      selectHidDeviceListener = null
    }
  }
  const removeSelectWebAuthnAccountHandler = (): void => {
    if (selectWebAuthnAccountListener) {
      electronSession.removeListener('select-webauthn-account', selectWebAuthnAccountListener)
      selectWebAuthnAccountListener = null
    }
  }

  return {
    clearCache: () => electronSession.clearCache(),
    clearCookies: () => electronSession.clearStorageData({ storages: ['cookies'] }),
    clearDisplayMediaRequestHandler: () => electronSession.setDisplayMediaRequestHandler(null),
    clearStorage: () => electronSession.clearStorageData(),
    cookies: createCookieStore(electronSession),
    denyDisplayMediaRequests: () => {
      electronSession.setDisplayMediaRequestHandler((_request, callback) => {
        callback({ video: undefined, audio: undefined })
      })
    },
    getUserAgent: () => electronSession.getUserAgent(),
    identity: electronSession,
    removeCertificateRequestHandler: () => electronSession.webRequest.onBeforeRequest(null),
    removeSelectHidDeviceHandler,
    removeSelectWebAuthnAccountHandler,
    setBeforeRequestHandler: (handler) => {
      electronSession.webRequest.onBeforeRequest((details, callback) => {
        const request: BrowserBeforeRequestDetails = {
          resourceType: details.resourceType,
          url: details.url,
          ...(details.webContentsId === undefined && details.webContents?.id === undefined
            ? {}
            : { webContentsId: details.webContentsId ?? details.webContents?.id })
        }
        callback(handler(request))
      })
    },
    setBeforeSendHeadersHandler: (handler) => {
      electronSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://*/*'] },
        (details, callback) => {
          const request: BrowserBeforeSendHeadersDetails = {
            requestHeaders: details.requestHeaders
          }
          callback({ requestHeaders: handler(request) })
        }
      )
    },
    setDevicePermissionHandler: (handler) => {
      electronSession.setDevicePermissionHandler(
        handler
          ? (details) =>
              handler({
                deviceType: details.deviceType,
                origin: details.origin,
                device: details.device
              })
          : null
      )
    },
    setPermissionCheckHandler: (handler: BrowserPermissionCheckHandler | null) => {
      electronSession.setPermissionCheckHandler(
        handler
          ? (_webContents, permission, _origin, details) => handler(permission, details)
          : null
      )
    },
    setPermissionRequestHandler: (handler: BrowserPermissionRequestHandler | null) => {
      electronSession.setPermissionRequestHandler(
        handler
          ? (webContents, permission, callback, details) =>
              handler(
                { id: webContents.id, getUrl: () => webContents.getURL() },
                permission,
                callback,
                details
              )
          : null
      )
    },
    setSelectHidDeviceHandler: (handler: BrowserSelectHidDeviceHandler) => {
      removeSelectHidDeviceHandler()
      const listener = (
        event: Electron.Event,
        details: Electron.SelectHidDeviceDetails,
        callback: (deviceId?: string | null) => void
      ): void => {
        const browserEvent: BrowserSessionEvent = { preventDefault: () => event.preventDefault() }
        const browserDetails: BrowserSelectHidDeviceDetails = {
          deviceList: details.deviceList,
          ...(details.frame?.url ? { frameUrl: details.frame.url } : {})
        }
        handler(browserEvent, browserDetails, callback)
      }
      selectHidDeviceListener = listener
      electronSession.on('select-hid-device', listener)
    },
    setSelectWebAuthnAccountHandler: (handler: BrowserSelectWebAuthnAccountHandler) => {
      removeSelectWebAuthnAccountHandler()
      const listener = (
        event: Electron.Event,
        details: Electron.SelectWebauthnAccountDetails,
        callback: (credentialId?: string | null) => void
      ): void => {
        const browserEvent: BrowserSessionEvent = { preventDefault: () => event.preventDefault() }
        const browserDetails: BrowserSelectWebAuthnAccountDetails = { accounts: details.accounts }
        handler(browserEvent, browserDetails, callback)
      }
      selectWebAuthnAccountListener = listener
      electronSession.on('select-webauthn-account', listener)
    },
    setUserAgent: (userAgent) => electronSession.setUserAgent(userAgent),
    watchDownloads: (listener) => {
      const handler = (
        _event: Electron.Event,
        item: Electron.DownloadItem,
        webContents: Electron.WebContents
      ): void => listener(createDownloadItem(item), webContents.id)
      electronSession.on('will-download', handler)
      return () => electronSession.removeListener('will-download', handler)
    }
  }
}

export function createElectronBrowserSessionProvider(): (partition: string) => BrowserSession {
  const sessionsByPartition = new Map<string, BrowserSession>()
  return (partition) => {
    const existing = sessionsByPartition.get(partition)
    if (existing) {
      return existing
    }
    const browserSession = createBrowserSession(session.fromPartition(partition))
    sessionsByPartition.set(partition, browserSession)
    return browserSession
  }
}
