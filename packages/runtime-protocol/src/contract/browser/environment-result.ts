import type { BrowserAgentCommandResult } from './page-result.js'

export type BrowserCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: string
}

export type BrowserCookieGetResult = {
  cookies: BrowserCookie[]
}

export type BrowserCookieSetResult = {
  success: boolean
}

export type BrowserCookieDeleteResult = {
  deleted: boolean
}

export type BrowserViewportResult = {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
}

export type BrowserGeolocationResult = {
  latitude: number
  longitude: number
  accuracy: number
}

export type BrowserInterceptedRequest = {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  resourceType: string
}

export type BrowserInterceptEnableResult = {
  enabled: boolean
  patterns: string[]
}

export type BrowserInterceptDisableResult = {
  disabled: boolean
}

export type BrowserInterceptListResult = {
  requests: BrowserInterceptedRequest[]
}

export type BrowserMouseClickResult = {
  clicked: {
    x: number
    y: number
    button: 'left' | 'right' | 'middle'
    adjusted: boolean
    handled: boolean
  }
}

export type BrowserMouseMoveResult = BrowserAgentCommandResult
export type BrowserMouseDownResult = BrowserAgentCommandResult
export type BrowserMouseUpResult = BrowserAgentCommandResult
export type BrowserMouseWheelResult = BrowserAgentCommandResult
export type BrowserSetDeviceResult = BrowserAgentCommandResult
export type BrowserSetOfflineResult = BrowserAgentCommandResult
export type BrowserSetHeadersResult = BrowserAgentCommandResult
export type BrowserSetCredentialsResult = BrowserAgentCommandResult
export type BrowserSetMediaResult = BrowserAgentCommandResult
export type BrowserClipboardReadResult = BrowserAgentCommandResult
export type BrowserClipboardWriteResult = BrowserAgentCommandResult
export type BrowserDialogAcceptResult = BrowserAgentCommandResult
export type BrowserDialogDismissResult = BrowserAgentCommandResult
export type BrowserStorageGetResult = BrowserAgentCommandResult
export type BrowserStorageSetResult = BrowserAgentCommandResult
export type BrowserStorageClearResult = BrowserAgentCommandResult
