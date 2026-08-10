export type BrowserCookieSameSite = 'unspecified' | 'no_restriction' | 'lax' | 'strict'

export type BrowserCookie = {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: BrowserCookieSameSite
  expirationDate?: number
}

export type BrowserCookieStore = {
  flush: () => Promise<void>
  remove: (url: string, name: string) => Promise<void>
  set: (cookie: BrowserCookie) => Promise<void>
}

export type BrowserSessionWebContents = {
  id: number
  getUrl: () => string
}

export type BrowserBeforeRequestDetails = {
  resourceType: string
  url: string
  webContentsId?: number
}

export type BrowserBeforeSendHeadersDetails = {
  requestHeaders: Record<string, string | string[]>
}

export type BrowserHidDevice = {
  collections?: { usagePage?: number }[]
  deviceId: string
}

export type BrowserSelectHidDeviceDetails = {
  deviceList: BrowserHidDevice[]
  frameUrl?: string
}

export type BrowserWebAuthnAccount = {
  credentialId: string
}

export type BrowserSelectWebAuthnAccountDetails = {
  accounts: BrowserWebAuthnAccount[]
}

export type BrowserSessionEvent = {
  preventDefault: () => void
}

export type BrowserDownloadItem = {
  cancel: () => void
  getFilename: () => string
  getMimeType: () => string
  getReceivedBytes: () => number
  getTotalBytes: () => number
  getUrl: () => string
  offUpdated: (listener: (state: 'progressing' | 'interrupted') => void) => void
  offDone: (listener: (state: 'completed' | 'cancelled' | 'interrupted') => void) => void
  onUpdated: (listener: (state: 'progressing' | 'interrupted') => void) => void
  onceDone: (listener: (state: 'completed' | 'cancelled' | 'interrupted') => void) => void
  setSavePath: (path: string) => void
}

export type BrowserPermissionRequestHandler = (
  webContents: BrowserSessionWebContents,
  permission: string,
  callback: (granted: boolean) => void,
  details: unknown
) => void

export type BrowserPermissionCheckHandler = (
  permission: string,
  details: { mediaType?: string; securityOrigin?: string }
) => boolean

export type BrowserDevicePermissionHandler = (details: {
  deviceType: string
  origin: string
  device: unknown
}) => boolean

export type BrowserSession = {
  clearCache: () => Promise<void>
  clearCookies: () => Promise<void>
  clearDisplayMediaRequestHandler: () => void
  clearStorage: () => Promise<void>
  cookies: BrowserCookieStore
  denyDisplayMediaRequests: () => void
  getUserAgent: () => string
  identity: object
  removeCertificateRequestHandler: () => void
  removeSelectHidDeviceHandler: () => void
  removeSelectWebAuthnAccountHandler: () => void
  setBeforeRequestHandler: (
    handler: (details: BrowserBeforeRequestDetails) => { cancel: boolean }
  ) => void
  setBeforeSendHeadersHandler: (
    handler: (details: BrowserBeforeSendHeadersDetails) => Record<string, string | string[]>
  ) => void
  setDevicePermissionHandler: (handler: BrowserDevicePermissionHandler | null) => void
  setPermissionCheckHandler: (handler: BrowserPermissionCheckHandler | null) => void
  setPermissionRequestHandler: (handler: BrowserPermissionRequestHandler | null) => void
  setSelectHidDeviceHandler: (
    handler: (
      event: BrowserSessionEvent,
      details: BrowserSelectHidDeviceDetails,
      callback: (deviceId?: string | null) => void
    ) => void
  ) => void
  setSelectWebAuthnAccountHandler: (
    handler: (
      event: BrowserSessionEvent,
      details: BrowserSelectWebAuthnAccountDetails,
      callback: (credentialId?: string | null) => void
    ) => void
  ) => void
  setUserAgent: (userAgent: string) => void
  watchDownloads: (
    listener: (item: BrowserDownloadItem, webContentsId: number) => void
  ) => () => void
}

export type BrowserSessionProvider = (partition: string) => BrowserSession | null

// Why: a pure Node host has no Chromium session service. Electron composition
// installs the provider; without it session-backed operations fail closed.
let browserSessionProvider: BrowserSessionProvider = () => null

export function setBrowserSessionProvider(provider: BrowserSessionProvider): void {
  browserSessionProvider = provider
}

export function resolveBrowserSession(partition: string): BrowserSession | null {
  return browserSessionProvider(partition)
}

export function requireBrowserSession(partition: string): BrowserSession {
  const browserSession = resolveBrowserSession(partition)
  if (!browserSession) {
    throw new Error('Browser session provider is unavailable')
  }
  return browserSession
}
