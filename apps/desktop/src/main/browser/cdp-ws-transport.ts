import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { WebSocket, WebSocketServer } from 'ws'

import type { BrowserPageHandle } from './page/handle'

export class CdpWsTransport {
  private client: WebSocket | null = null
  private detachClientListeners: (() => void) | null = null
  private httpServer: Server | null = null
  private readonly onClientCleared: () => void
  private readonly onMessage: (client: WebSocket, raw: string) => void
  private readonly page: BrowserPageHandle
  private port = 0
  private readonly responseSessionIdsByClient = new WeakMap<WebSocket, Map<number, string>>()
  private wss: WebSocketServer | null = null

  constructor(args: {
    onClientCleared: () => void
    onMessage: (client: WebSocket, raw: string) => void
    page: BrowserPageHandle
  }) {
    this.onClientCleared = args.onClientCleared
    this.onMessage = args.onMessage
    this.page = args.page
  }

  start(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.httpServer = createServer((request, response) =>
        this.handleHttpRequest(request, response)
      )
      this.wss = new WebSocketServer({ server: this.httpServer })
      const failStart = (error: Error): void => {
        this.httpServer?.removeListener('error', onListenError)
        this.wss?.close()
        this.wss = null
        this.httpServer?.close()
        this.httpServer = null
        reject(error)
      }
      const onListenError = (error: Error): void => failStart(error)
      this.wss.on('connection', (client) => this.acceptClient(client))
      this.httpServer.listen(0, '127.0.0.1', () => {
        this.httpServer?.removeListener('error', onListenError)
        const address = this.httpServer?.address()
        if (typeof address === 'object' && address) {
          this.port = address.port
          resolve(`ws://127.0.0.1:${this.port}`)
        } else {
          failStart(new Error('Failed to bind proxy server'))
        }
      })
      this.httpServer.once('error', onListenError)
    })
  }

  stop(): void {
    this.closeClient()
    this.wss?.close()
    this.wss = null
    this.httpServer?.close()
    this.httpServer = null
  }

  closeClient(): void {
    const client = this.client
    this.detachClientListeners?.()
    this.detachClientListeners = null
    this.client = null
    this.onClientCleared()
    if (client) {
      this.responseSessionIdsByClient.delete(client)
    }
    client?.close()
  }

  recordResponseSession(client: WebSocket, clientId: number, sessionId?: string): void {
    const responseSessionIds = this.responseSessionIdsByClient.get(client) ?? new Map()
    if (sessionId) {
      responseSessionIds.set(clientId, sessionId)
    } else {
      responseSessionIds.delete(clientId)
    }
    this.responseSessionIdsByClient.set(client, responseSessionIds)
  }

  sendResult(client: WebSocket, clientId: number, result: unknown): void {
    this.send(client, { id: clientId, result })
  }

  sendError(client: WebSocket, clientId: number, message: string): void {
    this.send(client, { id: clientId, error: { code: -32000, message } })
  }

  isActiveClient(client: WebSocket): boolean {
    return this.client === client && client.readyState === WebSocket.OPEN
  }

  broadcastCdpEvent(method: string, params: unknown, sessionId?: string): void {
    const client = this.client
    if (client?.readyState !== WebSocket.OPEN) {
      return
    }
    client.send(JSON.stringify({ method, params, sessionId }))
  }

  buildTargetInfo(): Record<string, unknown> {
    const closed = this.page.isClosed()
    const info = this.page.getInfo()
    return {
      targetId: 'yiru-proxy-target',
      type: 'page',
      title: closed ? '' : info.title,
      url: closed ? '' : info.url,
      attached: true,
      canAccessOpener: false
    }
  }

  private acceptClient(client: WebSocket): void {
    this.closeClient()
    this.client = client
    const onMessage = (data: WebSocket.RawData): void => this.onMessage(client, data.toString())
    const onClose = (): void => {
      detach()
      if (this.client === client) {
        this.onClientCleared()
        this.client = null
      }
    }
    const detach = (): void => {
      client.off('message', onMessage)
      client.off('close', onClose)
      if (this.detachClientListeners === detach) {
        this.detachClientListeners = null
      }
    }
    this.detachClientListeners = detach
    client.on('message', onMessage)
    client.on('close', onClose)
  }

  private send(client: WebSocket, payload: unknown): void {
    const responsePayload = this.addResponseSessionId(payload, client)
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(responsePayload))
    }
  }

  private addResponseSessionId(payload: unknown, client: WebSocket): unknown {
    if (typeof payload !== 'object' || payload === null) {
      return payload
    }
    const clientId = (payload as { id?: unknown }).id
    if (typeof clientId !== 'number') {
      return payload
    }
    const responseSessionIds = this.responseSessionIdsByClient.get(client)
    const sessionId = responseSessionIds?.get(clientId)
    responseSessionIds?.delete(clientId)
    return sessionId ? { ...payload, sessionId } : payload
  }

  private handleHttpRequest(request: IncomingMessage, response: ServerResponse): void {
    const url = request.url ?? ''
    if (url === '/json/version' || url === '/json/version/') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          Browser: `Chrome/${this.page.getInfo().browserVersion}`,
          'Protocol-Version': '1.3',
          webSocketDebuggerUrl: `ws://127.0.0.1:${this.port}`
        })
      )
      return
    }
    if (url === '/json' || url === '/json/' || url === '/json/list' || url === '/json/list/') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify([
          {
            ...this.buildTargetInfo(),
            id: 'yiru-proxy-target',
            webSocketDebuggerUrl: `ws://127.0.0.1:${this.port}`
          }
        ])
      )
      return
    }
    response.writeHead(404)
    response.end()
  }
}
