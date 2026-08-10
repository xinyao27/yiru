import { ANTI_DETECTION_SCRIPT } from '../anti-detection'
import type { BrowserPrintToPdfOptions } from '../cdp-print-to-pdf'
import type {
  BrowserPageCdpEvent,
  BrowserPageCdpLease,
  BrowserPageEvent,
  BrowserPageHandle,
  BrowserPageIdentity,
  BrowserPageInfo,
  BrowserPageReloadOptions
} from '../page/handle'
import { toCdpPrintOptions } from './print-options'
import { isChromePageCdpEvent } from './target-event-scope'
import type { ChromeCdpTransport } from './transport'

export type ChromeBrowserPageHandleOptions = {
  browserPageId: string
  browserVersion: string
  onClosed: (backendPageId: string) => void
  sessionId: string
  shellConnectionId: string | null
  targetId: string
  transport: ChromeCdpTransport
}

export class ChromeBrowserPageHandle implements BrowserPageHandle {
  readonly identity: BrowserPageIdentity
  private readonly browserVersion: string
  private readonly cdpListeners = new Set<(event: BrowserPageCdpEvent) => void>()
  private readonly eventListeners = new Set<(event: BrowserPageEvent) => void>()
  private readonly onClosed: (backendPageId: string) => void
  private readonly ownedSessionIds = new Set<string>()
  private readonly sessionId: string
  private readonly targetId: string
  private readonly transport: ChromeCdpTransport
  private readonly unsubscribeTransport: () => void
  private activeDocumentRequestId: string | null = null
  private mainFrameId: string | null = null
  private title = ''
  private url = 'about:blank'
  private closed = false

  constructor(options: ChromeBrowserPageHandleOptions) {
    this.browserVersion = options.browserVersion
    this.onClosed = options.onClosed
    this.sessionId = options.sessionId
    this.targetId = options.targetId
    this.transport = options.transport
    this.identity = {
      browserPageId: options.browserPageId,
      backendPageId: `chrome-target:${options.targetId}`,
      backendKind: 'chrome',
      rendererOwnerId: null,
      shellConnectionId: options.shellConnectionId
    }
    this.ownedSessionIds.add(options.sessionId)
    this.unsubscribeTransport = this.transport.subscribe(this.handleTransportEvent.bind(this))
  }

  async initialize(preDocumentScripts: readonly string[]): Promise<void> {
    await this.transport.send('Page.enable', {}, this.sessionId)
    await this.transport.send('Runtime.enable', {}, this.sessionId)
    await this.transport.send('Network.enable', {}, this.sessionId)
    await this.transport.send('Page.setLifecycleEventsEnabled', { enabled: true }, this.sessionId)
    for (const source of [ANTI_DETECTION_SCRIPT, ...preDocumentScripts]) {
      await this.transport.send('Page.addScriptToEvaluateOnNewDocument', { source }, this.sessionId)
    }
  }

  async navigate(url: string): Promise<void> {
    const result = await this.transport.send('Page.navigate', { url }, this.sessionId)
    const errorText = readString(result, 'errorText')
    this.url = url
    if (errorText) {
      this.emitPageEvent({
        type: 'load-failed',
        errorCode: -1,
        errorDescription: errorText,
        validatedUrl: url
      })
    }
  }

  async closeTarget(): Promise<void> {
    if (this.closed) {
      return
    }
    await this.transport.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {})
    this.markClosed('Chrome target closed')
  }

  isClosed(): boolean {
    return this.closed || !this.transport.isConnected()
  }

  getInfo(): BrowserPageInfo {
    return {
      title: this.title,
      url: this.url,
      browserVersion: this.browserVersion
    }
  }

  getUserAgent = (): string => `Mozilla/5.0 Chrome/${this.browserVersion} Safari/537.36`

  subscribe(listener: (event: BrowserPageEvent) => void): () => void {
    if (this.isClosed()) {
      listener({ type: 'closed' })
      return () => {}
    }
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  acquireCdp(): BrowserPageCdpLease {
    if (this.isClosed()) {
      throw new Error('Browser tab is no longer available')
    }
    let released = false
    const subscriptions = new Set<(event: BrowserPageCdpEvent) => void>()
    return {
      isConnected: () => !released && !this.isClosed(),
      sendCommand: async (method, params = {}, sessionId) => {
        if (released || this.isClosed()) {
          throw new Error('Browser debugger is no longer attached')
        }
        const result = await this.transport.send(method, params, sessionId ?? this.sessionId)
        const attachedSessionId = method.startsWith('Target.attachTo')
          ? readString(result, 'sessionId')
          : null
        if (attachedSessionId) {
          this.ownedSessionIds.add(attachedSessionId)
        }
        return result
      },
      subscribe: (listener) => {
        if (released) {
          return () => {}
        }
        this.cdpListeners.add(listener)
        subscriptions.add(listener)
        return () => {
          subscriptions.delete(listener)
          this.cdpListeners.delete(listener)
        }
      },
      release: () => {
        if (released) {
          return
        }
        released = true
        for (const listener of subscriptions) {
          this.cdpListeners.delete(listener)
        }
        subscriptions.clear()
      }
    }
  }

  async focus(): Promise<void> {
    if (this.isClosed()) {
      throw new Error('Browser tab is no longer available')
    }
    await this.transport.send('Target.activateTarget', { targetId: this.targetId })
  }

  async reload(options?: BrowserPageReloadOptions): Promise<void> {
    if (this.isClosed()) {
      throw new Error('Browser tab is no longer available')
    }
    await this.transport.send(
      'Page.reload',
      { ignoreCache: options?.ignoreCache === true },
      this.sessionId
    )
  }

  async printToPdf(options: BrowserPrintToPdfOptions): Promise<Uint8Array<ArrayBufferLike>> {
    if (this.isClosed()) {
      throw new Error('Browser tab is no longer available')
    }
    const result = await this.transport.send(
      'Page.printToPDF',
      toCdpPrintOptions(options),
      this.sessionId
    )
    const data = readString(result, 'data')
    if (!data) {
      throw new Error('Chrome returned no PDF data')
    }
    return new Uint8Array(Buffer.from(data, 'base64'))
  }

  prepareForCapture(): void {}

  private handleTransportEvent(event: BrowserPageCdpEvent): void {
    if (event.type === 'detached') {
      this.markClosed(event.reason ?? 'Chrome DevTools connection closed')
      return
    }
    if (!isChromePageCdpEvent(event, this.targetId, this.ownedSessionIds)) {
      return
    }
    this.updatePageState(event)
    const forwarded =
      event.sessionId === this.sessionId ? { ...event, sessionId: undefined } : event
    for (const listener of this.cdpListeners) {
      listener(forwarded)
    }
  }

  private updatePageState(event: Extract<BrowserPageCdpEvent, { type: 'message' }>): void {
    if (event.method === 'Target.targetDestroyed' && event.params.targetId === this.targetId) {
      this.markClosed('Chrome target closed')
      return
    }
    if (event.method === 'Target.targetInfoChanged') {
      const targetInfo = isRecord(event.params.targetInfo) ? event.params.targetInfo : null
      if (targetInfo?.targetId === this.targetId) {
        this.title = typeof targetInfo.title === 'string' ? targetInfo.title : this.title
        this.url = typeof targetInfo.url === 'string' ? targetInfo.url : this.url
      }
      return
    }
    if (event.sessionId !== this.sessionId) {
      return
    }
    if (event.method === 'Page.frameNavigated') {
      const frame = isRecord(event.params.frame) ? event.params.frame : null
      if (frame && typeof frame.id === 'string' && typeof frame.parentId !== 'string') {
        this.mainFrameId = frame.id
        this.url = typeof frame.url === 'string' ? frame.url : this.url
      }
      return
    }
    if (event.method === 'Network.requestWillBeSent') {
      const frameId = event.params.frameId
      if (
        event.params.type === 'Document' &&
        typeof event.params.requestId === 'string' &&
        (this.mainFrameId === null || frameId === this.mainFrameId)
      ) {
        this.mainFrameId = typeof frameId === 'string' ? frameId : this.mainFrameId
        this.activeDocumentRequestId = event.params.requestId
      }
      return
    }
    if (event.method === 'Network.loadingFailed') {
      if (
        event.params.requestId === this.activeDocumentRequestId &&
        event.params.canceled !== true
      ) {
        this.emitPageEvent({
          type: 'load-failed',
          errorCode: -1,
          errorDescription:
            typeof event.params.errorText === 'string'
              ? event.params.errorText
              : 'Chrome navigation failed',
          validatedUrl: this.url
        })
      }
      return
    }
    if (event.method === 'Page.loadEventFired') {
      this.activeDocumentRequestId = null
      this.refreshDocumentInfo()
      this.emitPageEvent({ type: 'load-finished' })
    }
  }

  private refreshDocumentInfo(): void {
    void this.transport
      .send(
        'Runtime.evaluate',
        {
          expression: '[document.title, window.location.href]',
          returnByValue: true
        },
        this.sessionId
      )
      .then((result) => {
        const remoteResult = isRecord(result) && isRecord(result.result) ? result.result : null
        const value = remoteResult?.value
        if (Array.isArray(value)) {
          this.title = typeof value[0] === 'string' ? value[0] : this.title
          this.url = typeof value[1] === 'string' ? value[1] : this.url
        }
      })
      .catch(() => {})
  }

  private emitPageEvent(event: BrowserPageEvent): void {
    for (const listener of this.eventListeners) {
      listener(event)
    }
  }

  private markClosed(reason: string): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.unsubscribeTransport()
    for (const listener of this.cdpListeners) {
      listener({ type: 'detached', reason })
    }
    this.cdpListeners.clear()
    this.emitPageEvent({ type: 'closed' })
    this.eventListeners.clear()
    this.onClosed(this.identity.backendPageId)
  }
}

function readString(value: unknown, key: string): string | null {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
