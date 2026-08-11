export type BrowserFindInPageOptions = {
  findNext?: boolean
  forward?: boolean
  matchCase?: boolean
}

export type BrowserFoundInPageEvent = Event & {
  result: {
    activeMatchOrdinal: number
    matches: number
  }
}

type BrowserWebviewEventMap = {
  'console-message': Event & { message?: string }
  'did-attach': Event
  'did-fail-load': Event & {
    errorCode?: number
    errorDescription?: string
    isMainFrame?: boolean
    validatedURL?: string
  }
  'did-navigate': Event & { isMainFrame?: boolean; url?: string }
  'did-navigate-in-page': Event & { isMainFrame?: boolean; url?: string }
  'did-start-loading': Event
  'did-stop-loading': Event
  'dom-ready': Event
  'found-in-page': BrowserFoundInPageEvent
  'page-favicon-updated': Event & { favicons?: string[] }
  'page-title-updated': Event & { title?: string }
}

type BrowserWebviewEventTarget = {
  addEventListener<K extends keyof BrowserWebviewEventMap>(
    type: K,
    listener: (event: BrowserWebviewEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof BrowserWebviewEventMap>(
    type: K,
    listener: (event: BrowserWebviewEventMap[K]) => void,
    options?: boolean | EventListenerOptions
  ): void
}

type BrowserWebviewCapture = {
  getSize: () => { height: number; width: number }
  isEmpty: () => boolean
  toDataURL: () => string
}

export type BrowserWebviewElement = HTMLElement &
  BrowserWebviewEventTarget & {
    src: string
    canGoBack: () => boolean
    canGoForward: () => boolean
    capturePage: () => Promise<BrowserWebviewCapture>
    executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
    findInPage: (text: string, options?: BrowserFindInPageOptions) => number
    getTitle: () => string
    getURL: () => string
    getWebContentsId: () => number
    getZoomLevel: () => number
    goBack: () => void
    goForward: () => void
    isDestroyed?: () => boolean
    reload: () => void
    reloadIgnoringCache: () => void
    setZoomLevel: (level: number) => void
    stop: () => void
    stopFindInPage: (action: 'clearSelection' | 'keepSelection' | 'activateSelection') => void
  }

export function createBrowserWebviewElement(): BrowserWebviewElement {
  // Why: lib.dom has no Electron webview tag entry; this is the one boundary
  // where the host-provided custom element is narrowed to the API client uses.
  return document.createElement('webview') as BrowserWebviewElement
}
