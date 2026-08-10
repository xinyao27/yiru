import type { BrowserPrintToPdfOptions } from '../cdp-print-to-pdf'

export type BrowserPageBackendKind = 'electron-webview' | 'electron-offscreen' | 'chrome'

export type BrowserPageIdentity = {
  readonly browserPageId: string
  readonly backendPageId: string
  readonly backendKind: BrowserPageBackendKind
  readonly rendererOwnerId: string | null
  readonly shellConnectionId: string | null
}

export type BrowserPageInfo = {
  title: string
  url: string
  browserVersion: string
}

export type BrowserPageEvent =
  | { type: 'closed' }
  | { type: 'load-finished' }
  | {
      type: 'load-failed'
      errorCode: number
      errorDescription: string
      validatedUrl: string
    }

export type BrowserPageCdpEvent =
  | {
      type: 'message'
      method: string
      params: Record<string, unknown>
      sessionId?: string
    }
  | { type: 'detached'; reason?: string }

export type BrowserPageCdpLease = {
  isConnected: () => boolean
  sendCommand: (
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string
  ) => Promise<unknown>
  subscribe: (listener: (event: BrowserPageCdpEvent) => void) => () => void
  release: () => void
}

export type BrowserPageReloadOptions = {
  ignoreCache?: boolean
}

export type BrowserPageHandle = {
  readonly identity: BrowserPageIdentity
  isClosed: () => boolean
  getInfo: () => BrowserPageInfo
  getUserAgent: () => string
  subscribe: (listener: (event: BrowserPageEvent) => void) => () => void
  acquireCdp: () => BrowserPageCdpLease
  focus: () => Promise<void>
  reload: (options?: BrowserPageReloadOptions) => Promise<void>
  printToPdf: (options: BrowserPrintToPdfOptions) => Promise<Uint8Array<ArrayBufferLike>>
  prepareForCapture: () => void
  openDevTools?: () => void
  captureCompositorFrame?: (params: Record<string, unknown>) => Promise<{ data: string } | null>
}
