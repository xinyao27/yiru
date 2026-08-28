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

// ── Viewport emulation types ──

export type BrowserViewportResult = {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
}

// ── Geolocation types ──

export type BrowserGeolocationResult = {
  latitude: number
  longitude: number
  accuracy: number
}

// ── Request interception types ──

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

// ── Console/network capture types ──

export type BrowserConsoleEntry = {
  level: string
  text: string
  timestamp: number
  url?: string
  line?: number
}

export type BrowserConsoleResult = {
  entries: BrowserConsoleEntry[]
  truncated: boolean
}

export type BrowserNetworkEntry = {
  url: string
  method: string
  status: number
  mimeType: string
  size: number
  timestamp: number
}

export type BrowserNetworkLogResult = {
  entries: BrowserNetworkEntry[]
  truncated: boolean
}

export type BrowserCaptureStartResult = {
  capturing: boolean
}

export type BrowserCaptureStopResult = {
  stopped: boolean
}

export type BrowserExecResult = {
  output: unknown
}

export type BrowserTabCreateResult = {
  browserPageId: string
}

export type BrowserTabCloseResult = {
  closed: boolean
}

export type BrowserErrorCode =
  | 'browser_no_tab'
  | 'browser_tab_not_found'
  | 'browser_tab_closed'
  | 'browser_stale_ref'
  | 'browser_ref_not_found'
  | 'browser_navigation_failed'
  | 'browser_element_not_interactable'
  | 'browser_eval_error'
  | 'browser_cdp_error'
  | 'browser_debugger_detached'
  | 'browser_timeout'
  | 'browser_error'

export type EmulatorErrorCode =
  | 'emulator_no_active'
  | 'emulator_device_not_found'
  | 'emulator_helper_failed'
  | 'emulator_not_macos'
  | 'emulator_error'
