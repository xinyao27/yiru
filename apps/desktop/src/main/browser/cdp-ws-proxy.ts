import type { WebSocket } from 'ws'

import { ANTI_DETECTION_SCRIPT } from './anti-detection'
import { CdpClientSessions } from './cdp-client-sessions'
import { CdpPageCommandDispatcher } from './cdp-page-command-dispatcher'
import { CdpWsTransport } from './cdp-ws-transport'
import type { BrowserPageCdpLease, BrowserPageHandle } from './page/handle'

type CdpClientMessage = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  sessionId?: string
}

export class CdpWsProxy {
  private attached = false
  private cdpLease: BrowserPageCdpLease | null = null
  private readonly dispatcher: CdpPageCommandDispatcher
  private readonly page: BrowserPageHandle
  private readonly sessions = new CdpClientSessions()
  private readonly transport: CdpWsTransport
  private unsubscribeCdp: (() => void) | null = null

  constructor(page: BrowserPageHandle) {
    this.page = page
    this.transport = new CdpWsTransport({
      page,
      onClientCleared: () => this.clearClientState(),
      onMessage: (client, raw) => this.handleClientMessage(client, raw)
    })
    this.dispatcher = new CdpPageCommandDispatcher({
      page,
      sessions: this.sessions,
      transport: this.transport,
      getCdp: () => this.cdpLease
    })
  }

  async start(): Promise<string> {
    await this.attachDebugger()
    try {
      return await this.transport.start()
    } catch (error) {
      // Why: bind failure occurs after debugger attachment and callers cannot
      // safely stop an instance whose start rejected.
      this.detachDebugger()
      throw error
    }
  }

  async stop(): Promise<void> {
    this.detachDebugger()
    this.transport.stop()
  }

  private clearClientState(): void {
    this.sessions.clear()
    this.dispatcher.clearClientState()
  }

  private async attachDebugger(): Promise<void> {
    if (this.attached) {
      return
    }
    try {
      this.cdpLease = this.page.acquireCdp()
    } catch {
      throw new Error('Could not attach debugger. DevTools may already be open for this tab.')
    }
    this.attached = true
    try {
      await this.dispatcher.sendDebuggerCommand('Page.enable', {})
      await this.dispatcher.sendDebuggerCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: ANTI_DETECTION_SCRIPT
      })
    } catch {
      // The page domain may not be ready; injection is best effort.
    }
    this.unsubscribeCdp = this.cdpLease.subscribe((event) => {
      if (event.type === 'detached') {
        this.attached = false
        const lease = this.cdpLease
        this.cdpLease = null
        lease?.release()
        void this.stop()
        return
      }
      // Why: Electron uses an empty root session ID, while agent-browser
      // filters events by the synthetic attachToTarget session.
      this.transport.broadcastCdpEvent(
        event.method,
        event.params,
        event.sessionId || this.sessions.currentSessionId()
      )
    })
  }

  private detachDebugger(): void {
    this.unsubscribeCdp?.()
    this.unsubscribeCdp = null
    const lease = this.cdpLease
    this.cdpLease = null
    lease?.release()
    this.attached = false
  }

  private handleClientMessage(client: WebSocket, raw: string): void {
    let message: CdpClientMessage
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (message.id == null || !message.method) {
      return
    }
    const clientId = message.id
    this.transport.recordResponseSession(client, clientId, message.sessionId)
    if (this.handleTargetCommand(client, clientId, message)) {
      return
    }
    if (message.method === 'Browser.getVersion') {
      this.transport.sendResult(client, clientId, {
        protocolVersion: '1.3',
        product: `Chrome/${this.page.getInfo().browserVersion}`,
        userAgent: '',
        jsVersion: ''
      })
      return
    }
    this.dispatcher.dispatch(
      client,
      clientId,
      message.method,
      message.params ?? {},
      message.sessionId
    )
  }

  private handleTargetCommand(
    client: WebSocket,
    clientId: number,
    message: CdpClientMessage
  ): boolean {
    if (message.method === 'Target.getTargets') {
      this.transport.sendResult(client, clientId, {
        targetInfos: [this.transport.buildTargetInfo()]
      })
      return true
    }
    if (message.method === 'Target.getTargetInfo') {
      this.transport.sendResult(client, clientId, {
        targetInfo: this.transport.buildTargetInfo()
      })
      return true
    }
    if (message.method === 'Target.setDiscoverTargets') {
      this.transport.sendResult(client, clientId, {})
      return true
    }
    if (message.method === 'Target.detachFromTarget') {
      this.sessions.detach(message.params?.sessionId)
      this.transport.sendResult(client, clientId, {})
      return true
    }
    if (message.method === 'Target.attachToBrowserTarget') {
      this.transport.sendResult(client, clientId, { sessionId: this.sessions.attachBrowser() })
      return true
    }
    if (message.method === 'Target.attachToTarget') {
      this.transport.sendResult(client, clientId, { sessionId: this.sessions.attachPage() })
      return true
    }
    return false
  }
}
