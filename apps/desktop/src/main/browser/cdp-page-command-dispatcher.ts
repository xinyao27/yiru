import type { WebSocket } from 'ws'

import type { CdpClientSessions } from './cdp-client-sessions'
import { CdpPdfCommandHandler } from './cdp-pdf-command-handler'
import { captureScreenshot } from './cdp-screenshot'
import type { CdpWsTransport } from './cdp-ws-transport'
import type { BrowserPageCdpLease, BrowserPageHandle } from './page/handle'

const LIFECYCLE_PRIMING_TIMEOUT_MS = 1_000

export class CdpPageCommandDispatcher {
  private readonly getCdp: () => BrowserPageCdpLease | null
  private readonly page: BrowserPageHandle
  private readonly pdfCommands: CdpPdfCommandHandler
  private readonly pendingDomFocusBySession = new Map<
    string | undefined,
    Promise<Record<string, unknown> | undefined>
  >()
  private readonly sessions: CdpClientSessions
  private readonly transport: CdpWsTransport

  constructor(args: {
    getCdp: () => BrowserPageCdpLease | null
    page: BrowserPageHandle
    sessions: CdpClientSessions
    transport: CdpWsTransport
  }) {
    this.getCdp = args.getCdp
    this.page = args.page
    this.pdfCommands = new CdpPdfCommandHandler(args.page, args.transport)
    this.sessions = args.sessions
    this.transport = args.transport
  }

  clearClientState(): void {
    this.pendingDomFocusBySession.clear()
    this.pdfCommands.clear()
  }

  sendDebuggerCommand(
    method: string,
    params: Record<string, unknown>,
    sessionId?: string
  ): Promise<unknown> {
    const cdp = this.getCdp()
    return cdp
      ? cdp.sendCommand(method, params, sessionId)
      : Promise.reject(new Error('Browser debugger is no longer attached'))
  }

  dispatch(
    client: WebSocket,
    clientId: number,
    method: string,
    params: Record<string, unknown>,
    messageSessionId?: string
  ): void {
    const effectiveSessionId = this.sessions.resolveDebuggerSessionId(messageSessionId)
    // Why: stored focus is valid only for the immediately following insert.
    if (method !== 'DOM.focus' && method !== 'Input.insertText') {
      this.pendingDomFocusBySession.delete(effectiveSessionId)
    }
    if (method === 'Page.bringToFront') {
      void this.page.focus().then(
        () => this.transport.sendResult(client, clientId, {}),
        (error: unknown) => this.sendCaughtError(client, clientId, error)
      )
      return
    }
    if (method === 'DOM.focus') {
      // Why: set synchronously before a pipelined Input.insertText can arrive.
      const focused = this.sendDomFocus(client, clientId, params, effectiveSessionId)
      this.pendingDomFocusBySession.set(effectiveSessionId, focused)
      return
    }
    if (method === 'Page.captureScreenshot') {
      this.handleScreenshot(client, clientId, params)
      return
    }
    if (this.pdfCommands.dispatch(client, clientId, method, params)) {
      return
    }
    if (method === 'Input.insertText' && !this.page.isClosed()) {
      void this.page.focus().then(
        () => this.forwardInsertText(client, clientId, params, effectiveSessionId),
        (error: unknown) => this.sendCaughtError(client, clientId, error)
      )
      return
    }
    if (method === 'Page.navigate' && !this.page.isClosed()) {
      void this.navigateWithLifecycle(client, clientId, params, messageSessionId)
      return
    }
    if (method === 'Page.reload' && !this.page.isClosed()) {
      void this.reloadWithLifecycle(client, clientId, params, messageSessionId)
      return
    }
    this.forwardCommand(client, clientId, method, params, messageSessionId)
  }

  private forwardCommand(
    client: WebSocket,
    clientId: number,
    method: string,
    params: Record<string, unknown>,
    messageSessionId?: string
  ): void {
    if (this.page.isClosed()) {
      this.transport.sendError(client, clientId, 'Browser tab is no longer available')
      return
    }
    const sessionId = this.sessions.resolveDebuggerSessionId(messageSessionId)
    try {
      this.sendDebuggerCommand(method, params, sessionId).then(
        (result) => this.transport.sendResult(client, clientId, result),
        (error: Error) => this.transport.sendError(client, clientId, error.message)
      )
    } catch (error) {
      this.sendCaughtError(client, clientId, error)
    }
  }

  private async navigateWithLifecycle(
    client: WebSocket,
    clientId: number,
    params: Record<string, unknown>,
    messageSessionId?: string
  ): Promise<void> {
    await this.primePageLifecycle(this.sessions.resolveDebuggerSessionId(messageSessionId))
    if (this.transport.isActiveClient(client)) {
      this.forwardCommand(client, clientId, 'Page.navigate', params, messageSessionId)
    }
  }

  private async reloadWithLifecycle(
    client: WebSocket,
    clientId: number,
    params: Record<string, unknown>,
    messageSessionId?: string
  ): Promise<void> {
    const sessionId = this.sessions.resolveDebuggerSessionId(messageSessionId)
    const unsupportedParam = sessionId
      ? null
      : (Object.keys(params).find((key) => key !== 'ignoreCache') ?? null)
    if (unsupportedParam) {
      this.transport.sendError(
        client,
        clientId,
        `Page.reload parameter "${unsupportedParam}" is not supported for Yiru tab reloads`
      )
      return
    }
    await this.primePageLifecycle(sessionId)
    if (!this.transport.isActiveClient(client)) {
      return
    }
    if (sessionId) {
      this.forwardCommand(client, clientId, 'Page.reload', params, messageSessionId)
      return
    }
    if (this.page.isClosed()) {
      this.transport.sendError(client, clientId, 'Browser tab is no longer available')
      return
    }
    try {
      await this.page.reload({ ignoreCache: params.ignoreCache === true })
      this.transport.sendResult(client, clientId, {})
    } catch (error) {
      this.sendCaughtError(client, clientId, error)
    }
  }

  private async primePageLifecycle(sessionId?: string): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | null = null
    const priming = (async (): Promise<void> => {
      await this.sendDebuggerCommand('Network.enable', {}, sessionId)
      await this.sendDebuggerCommand('Page.enable', {}, sessionId)
      await this.sendDebuggerCommand('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId)
    })().catch(() => {})
    try {
      await Promise.race([
        priming,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, LIFECYCLE_PRIMING_TIMEOUT_MS)
          timeout.unref?.()
        })
      ])
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }

  private async sendDomFocus(
    client: WebSocket,
    clientId: number,
    params: Record<string, unknown>,
    sessionId?: string
  ): Promise<Record<string, unknown> | undefined> {
    if (this.page.isClosed()) {
      this.transport.sendError(client, clientId, 'Browser tab is no longer available')
      return undefined
    }
    try {
      const result = await this.sendDebuggerCommand('DOM.focus', params, sessionId)
      this.transport.sendResult(client, clientId, result)
      return { ...params }
    } catch (error) {
      this.sendCaughtError(client, clientId, error)
      return undefined
    }
  }

  private async forwardInsertText(
    client: WebSocket,
    clientId: number,
    params: Record<string, unknown>,
    sessionId?: string
  ): Promise<void> {
    const pendingFocus = this.pendingDomFocusBySession.get(sessionId)
    this.pendingDomFocusBySession.delete(sessionId)
    const pendingFocusParams = pendingFocus ? await pendingFocus : undefined
    if (!this.transport.isActiveClient(client)) {
      return
    }
    if (pendingFocusParams) {
      if (this.page.isClosed()) {
        this.transport.sendError(client, clientId, 'Browser tab is no longer available')
        return
      }
      try {
        await this.sendDebuggerCommand('DOM.focus', pendingFocusParams, sessionId)
      } catch (error) {
        this.sendCaughtError(client, clientId, error)
        return
      }
      if (!this.transport.isActiveClient(client)) {
        return
      }
    }
    this.forwardCommand(client, clientId, 'Input.insertText', params, sessionId)
  }

  private handleScreenshot(
    client: WebSocket,
    clientId: number,
    params: Record<string, unknown>
  ): void {
    const cdp = this.getCdp()
    if (!cdp) {
      this.transport.sendError(client, clientId, 'Browser debugger is no longer attached')
      return
    }
    captureScreenshot(
      this.page,
      cdp,
      params,
      (result) => this.transport.sendResult(client, clientId, result),
      (message) => this.transport.sendError(client, clientId, message)
    )
  }

  private sendCaughtError(client: WebSocket, clientId: number, error: unknown): void {
    this.transport.sendError(
      client,
      clientId,
      error instanceof Error ? error.message : String(error)
    )
  }
}
