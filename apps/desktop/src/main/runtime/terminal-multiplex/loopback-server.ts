import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'

import type { AnyRouter } from '@orpc/server'
import { WebSocketServer, type WebSocket } from 'ws'

import type { AuthenticatedMobileSocket } from '../rpc/mobile-socket-wiring'
import { RuntimeOrpcWsHandler } from '../rpc/orpc/ws-handler'
import type { YiruRuntimeService } from '../yiru-runtime'
import type { TerminalMultiplexConnections } from './connections'

const LOOPBACK_ADDRESS = '127.0.0.1'
const LOOPBACK_TOKEN_BYTES = 32
const LOOPBACK_TOKEN_DEADLINE_MS = 2_000
const LOOPBACK_FAILURE_WINDOW_MS = 60_000
const LOOPBACK_MAX_FAILURES = 8

type TerminalMultiplexLoopbackServerOptions = {
  runtime: YiruRuntimeService
  router: AnyRouter
  connections: TerminalMultiplexConnections
  allowedOrigins: readonly string[]
  browserSecurity: {
    contextIsolation: true
    sandbox: true
    webSecurity: true
  }
}

export class TerminalMultiplexLoopbackServer {
  private readonly options: TerminalMultiplexLoopbackServerOptions
  private readonly processToken = randomBytes(LOOPBACK_TOKEN_BYTES)
  private readonly failedAt: number[] = []
  private httpServer: Server | null = null
  private webSocketServer: WebSocketServer | null = null
  private endpointValue: string | null = null
  private handler: RuntimeOrpcWsHandler | null = null

  constructor(options: TerminalMultiplexLoopbackServerOptions) {
    if (
      !options.browserSecurity.contextIsolation ||
      !options.browserSecurity.sandbox ||
      !options.browserSecurity.webSecurity
    ) {
      throw new Error('Terminal loopback requires hardened BrowserWindow preferences')
    }
    this.options = options
  }

  get endpoint(): string | null {
    return this.endpointValue
  }

  copyProcessToken(): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(this.processToken.byteLength)
    copy.set(this.processToken)
    return copy
  }

  async start(): Promise<void> {
    if (this.httpServer) {
      return
    }
    const httpServer = createServer()
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(0, LOOPBACK_ADDRESS, () => {
        httpServer.off('error', reject)
        resolve()
      })
    })
    const address = httpServer.address()
    if (!address || typeof address === 'string' || address.address !== LOOPBACK_ADDRESS) {
      await closeHttpServer(httpServer)
      throw new Error('Terminal loopback server did not bind exact IPv4 loopback')
    }
    const expectedHost = `${LOOPBACK_ADDRESS}:${address.port}`
    const webSocketServer = new WebSocketServer({
      server: httpServer,
      maxPayload: 1024 * 1024 + 128,
      verifyClient: (info, done) => {
        const accepted = this.admitUpgrade(info.req, expectedHost)
        done(accepted, accepted ? undefined : 403)
      }
    })
    this.handler = this.createHandler()
    webSocketServer.on('connection', (ws, request) => this.admitToken(ws, request))
    this.httpServer = httpServer
    this.webSocketServer = webSocketServer
    this.endpointValue = `ws://${expectedHost}`
  }

  async stop(): Promise<void> {
    const webSocketServer = this.webSocketServer
    const httpServer = this.httpServer
    this.webSocketServer = null
    this.httpServer = null
    this.endpointValue = null
    this.handler = null
    if (webSocketServer) {
      for (const client of webSocketServer.clients) {
        client.terminate()
      }
      webSocketServer.close()
    }
    if (httpServer) {
      await closeHttpServer(httpServer)
    }
  }

  private admitUpgrade(request: IncomingMessage, expectedHost: string): boolean {
    this.pruneFailures()
    if (this.failedAt.length >= LOOPBACK_MAX_FAILURES) {
      return false
    }
    const origin = request.headers.origin
    return (
      request.socket.remoteAddress === LOOPBACK_ADDRESS &&
      request.headers.host === expectedHost &&
      typeof origin === 'string' &&
      origin !== 'null' &&
      this.options.allowedOrigins.includes(origin)
    )
  }

  private admitToken(ws: WebSocket, request: IncomingMessage): void {
    let admitted = false
    const timer = setTimeout(() => reject(), LOOPBACK_TOKEN_DEADLINE_MS)
    timer.unref?.()
    const reject = (): void => {
      if (admitted) {
        return
      }
      clearTimeout(timer)
      this.failedAt.push(Date.now())
      ws.close(1008, 'Loopback admission rejected')
    }
    const onFirstMessage = (data: WebSocket.RawData, isBinary: boolean): void => {
      ws.off('message', onFirstMessage)
      if (!isBinary) {
        reject()
        return
      }
      const candidate = new Uint8Array(data as Buffer)
      if (
        candidate.byteLength !== this.processToken.byteLength ||
        !timingSafeEqual(candidate, this.processToken)
      ) {
        reject()
        return
      }
      admitted = true
      clearTimeout(timer)
      this.bindAdmittedSocket(ws, request)
    }
    ws.once('message', onFirstMessage)
  }

  private bindAdmittedSocket(ws: WebSocket, _request: IncomingMessage): void {
    const connectionId = randomUUID()
    const socket: AuthenticatedMobileSocket = {
      ws,
      connectionId,
      device: {
        deviceId: 'loopback-renderer',
        deviceToken: 'process-scoped',
        scope: 'runtime'
      },
      sendText: (plaintext) => sendWebSocket(ws, plaintext),
      sendBinary: (plaintext) => sendWebSocket(ws, plaintext)
    }
    const onMessage = (data: WebSocket.RawData, isBinary: boolean): void => {
      if (isBinary) {
        const bytes = new Uint8Array(data as Buffer)
        if (!this.handler?.handleBinary(socket, bytes)) {
          if (!this.options.connections.handle(connectionId, bytes)) {
            ws.close(1003, 'Invalid terminal multiplex frame')
          }
        }
        return
      }
      if (!this.handler?.handleText(socket, data.toString())) {
        ws.close(1003, 'Invalid terminal multiplex invocation')
      }
    }
    const onClose = (): void => {
      this.handler?.close(socket)
      this.options.connections.closeConnection(connectionId)
      this.options.runtime.cleanupSubscriptionsForConnection(connectionId)
    }
    ws.on('message', onMessage)
    ws.once('close', onClose)
  }

  private createHandler(): RuntimeOrpcWsHandler {
    return new RuntimeOrpcWsHandler({
      runtime: this.options.runtime,
      router: this.options.router,
      resolveAdmission: () => ({
        principal: { kind: 'paired-device', deviceId: 'loopback-renderer', scope: 'runtime' }
      }),
      beforeInvocation: (socket, invocation) => {
        const admission = this.options.connections.admitInvocation(
          socket.connectionId,
          invocation.method,
          invocation.input,
          'loopback-renderer',
          invocation.requestId
        )
        if (admission === 'accepted') {
          return undefined
        }
        queueMicrotask(() => socket.ws.close(1008, admission))
        return {
          denial: {
            code: admission,
            status: 409,
            message: 'Terminal multiplex admission was rejected'
          }
        }
      },
      registerBinaryStreamHandler: (connectionId, streamId, handler) =>
        this.options.connections.register(connectionId, streamId, handler),
      activateTerminalMultiplexEpoch: (socket) =>
        this.options.connections.activateEpoch(socket.connectionId, (code, reason) =>
          socket.ws.close(code, reason)
        )
    })
  }

  private pruneFailures(): void {
    const oldestAllowed = Date.now() - LOOPBACK_FAILURE_WINDOW_MS
    while (this.failedAt[0] !== undefined && this.failedAt[0] < oldestAllowed) {
      this.failedAt.shift()
    }
  }
}

function sendWebSocket(ws: WebSocket, payload: string | Uint8Array<ArrayBufferLike>): boolean {
  if (ws.readyState !== ws.OPEN) {
    return false
  }
  ws.send(payload)
  return true
}

async function closeHttpServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
