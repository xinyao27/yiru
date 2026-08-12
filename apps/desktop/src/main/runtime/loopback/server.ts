import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'

import type { AnyRouter } from '@orpc/server'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  encodeRuntimeLoopbackError,
  encodeRuntimeLoopbackReady,
  type RuntimeLoopbackTarget
} from '~shared/runtime-loopback'

import type { AuthenticatedMobileSocket } from '../rpc/mobile-socket-wiring'
import { electronShellServicesConnectionId } from '../rpc/orpc/shell-services-identity'
import { RuntimeOrpcWsHandler } from '../rpc/orpc/ws-handler'
import type { TerminalMultiplexConnections } from '../terminal-multiplex/connections'
import type { YiruRuntimeService } from '../yiru-runtime'
import { RUNTIME_LOOPBACK_ADDRESS, RuntimeLoopbackAdmission } from './admission'
import { bindRuntimeEnvironmentLoopbackSocket } from './environment-socket'
import { parseTargetFrame, rawDataBytes, sendWebSocket } from './socket-frames'

const LOOPBACK_TOKEN_DEADLINE_MS = 2_000
const LOOPBACK_TARGET_DEADLINE_MS = 2_000

type RuntimeLoopbackServerOptions = {
  runtime: YiruRuntimeService
  router: AnyRouter
  connections: TerminalMultiplexConnections
  userDataPath: string
  browserSecurity: {
    contextIsolation: true
    sandbox: true
    webSecurity: true
  }
}

type EndpointWaiter = { resolve: (endpoint: string) => void; reject: (error: Error) => void }

export class RuntimeLoopbackServer {
  private readonly admission = new RuntimeLoopbackAdmission()
  private readonly endpointWaiters = new Set<EndpointWaiter>()
  private httpServer: Server | null = null
  private webSocketServer: WebSocketServer | null = null
  private endpointValue: string | null = null
  private handler: RuntimeOrpcWsHandler | null = null

  constructor(private readonly options: RuntimeLoopbackServerOptions) {
    if (
      !options.browserSecurity.contextIsolation ||
      !options.browserSecurity.sandbox ||
      !options.browserSecurity.webSecurity
    ) {
      throw new Error('Runtime loopback requires hardened BrowserWindow preferences')
    }
  }

  get endpoint(): string | null {
    return this.endpointValue
  }

  async credentialsForRenderer(
    webContentsId: number,
    rendererUrl: string
  ): Promise<{ endpoint: string; processToken: Uint8Array<ArrayBuffer> }> {
    this.admission.authorizeRenderer(webContentsId, rendererUrl)
    const endpoint = await this.waitForEndpoint()
    return { endpoint, processToken: this.admission.copyProcessToken() }
  }

  async start(): Promise<void> {
    if (this.httpServer) {
      return
    }
    const httpServer = createServer()
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject)
        httpServer.listen(0, RUNTIME_LOOPBACK_ADDRESS, () => {
          httpServer.off('error', reject)
          resolve()
        })
      })
      const address = httpServer.address()
      if (!address || typeof address === 'string' || address.address !== RUNTIME_LOOPBACK_ADDRESS) {
        throw new Error('Runtime loopback server did not bind exact IPv4 loopback')
      }
      const expectedHost = `${RUNTIME_LOOPBACK_ADDRESS}:${address.port}`
      const webSocketServer = new WebSocketServer({
        server: httpServer,
        maxPayload: 1024 * 1024 + 128,
        verifyClient: (info, done) => {
          const accepted = this.admission.admitUpgrade(info.req, expectedHost)
          done(accepted, accepted ? undefined : 403)
        }
      })
      this.handler = this.createHandler()
      webSocketServer.on('connection', (ws, request) => this.admitToken(ws, request))
      this.httpServer = httpServer
      this.webSocketServer = webSocketServer
      this.endpointValue = `ws://${expectedHost}`
      this.resolveEndpointWaiters(this.endpointValue)
    } catch (error) {
      await closeHttpServer(httpServer).catch(() => {})
      this.rejectEndpointWaiters(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  async stop(): Promise<void> {
    const webSocketServer = this.webSocketServer
    const httpServer = this.httpServer
    this.webSocketServer = null
    this.httpServer = null
    this.endpointValue = null
    this.handler = null
    this.rejectEndpointWaiters(new Error('Runtime loopback server stopped before becoming ready'))
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

  private admitToken(ws: WebSocket, request: IncomingMessage): void {
    const reject = (): void => ws.close(1008, 'Loopback admission rejected')
    const timer = setTimeout(reject, LOOPBACK_TOKEN_DEADLINE_MS)
    timer.unref?.()
    ws.once('message', (data, isBinary) => {
      clearTimeout(timer)
      const candidate = isBinary ? rawDataBytes(data) : new Uint8Array()
      if (!this.admission.admitToken(candidate)) {
        reject()
        return
      }
      this.admitTarget(ws, request)
    })
  }

  private admitTarget(ws: WebSocket, request: IncomingMessage): void {
    const timer = setTimeout(
      () => ws.close(1008, 'Loopback target missing'),
      LOOPBACK_TARGET_DEADLINE_MS
    )
    timer.unref?.()
    ws.once('message', (data, isBinary) => {
      clearTimeout(timer)
      const target = isBinary ? null : parseTargetFrame(data.toString())
      if (!target) {
        sendWebSocket(ws, encodeRuntimeLoopbackError('invalid_target', 'Invalid loopback target'))
        ws.close(1008, 'Invalid loopback target')
        return
      }
      void this.bindTarget(ws, request, target)
    })
  }

  private async bindTarget(
    ws: WebSocket,
    request: IncomingMessage,
    target: RuntimeLoopbackTarget
  ): Promise<void> {
    if (target.kind === 'local') {
      this.bindLocalSocket(ws, request)
      return
    }
    const renderer = this.admission.getRendererIdentity()
    await bindRuntimeEnvironmentLoopbackSocket({
      ws,
      userDataPath: this.options.userDataPath,
      ownerId: `loopback:${renderer?.webContentsId ?? 'unknown'}`,
      environmentId: target.environmentId,
      ...(target.timeoutMs === undefined ? {} : { timeoutMs: target.timeoutMs })
    })
  }

  private bindLocalSocket(ws: WebSocket, _request: IncomingMessage): void {
    const renderer = this.admission.getRendererIdentity()
    if (!renderer || !this.handler) {
      ws.close(1008, 'Renderer identity unavailable')
      return
    }
    const connectionId = randomUUID()
    const socket: AuthenticatedMobileSocket = {
      ws,
      connectionId,
      renderingWebContentsId: renderer.webContentsId,
      shellConnectionId: electronShellServicesConnectionId(renderer.webContentsId),
      device: {
        deviceId: 'loopback-renderer',
        deviceToken: 'process-scoped',
        scope: 'runtime'
      },
      sendText: (plaintext) => sendWebSocket(ws, plaintext),
      sendBinary: (plaintext) => sendWebSocket(ws, plaintext)
    }
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const bytes = rawDataBytes(data)
        if (!this.handler?.handleBinary(socket, bytes)) {
          if (!this.options.connections.handle(connectionId, bytes)) {
            ws.close(1003, 'Invalid terminal multiplex frame')
          }
        }
      } else if (!this.handler?.handleText(socket, data.toString())) {
        ws.close(1003, 'Invalid runtime oRPC frame')
      }
    })
    ws.once('close', () => {
      this.handler?.close(socket)
      this.options.connections.closeConnection(connectionId)
      this.options.runtime.cleanupSubscriptionsForConnection(connectionId)
    })
    sendWebSocket(ws, encodeRuntimeLoopbackReady(this.options.runtime.getRuntimeId()))
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
        return admission === 'accepted'
          ? undefined
          : { denial: { code: admission, status: 409, message: 'Connection use conflict' } }
      },
      registerBinaryStreamHandler: (connectionId, streamId, handler) =>
        this.options.connections.register(connectionId, streamId, handler),
      openTerminalMultiplex: (_socket, input) => {
        if (!this.endpointValue) {
          throw new Error('terminal_loopback_unavailable')
        }
        return this.options.connections.issueTicket(
          'loopback-renderer',
          input.clientInstanceId,
          input.environmentId,
          this.endpointValue
        )
      },
      activateTerminalMultiplexEpoch: (socket) =>
        this.options.connections.activateEpoch(socket.connectionId, (code, reason) =>
          socket.ws.close(code, reason)
        )
    })
  }

  private waitForEndpoint(): Promise<string> {
    if (this.endpointValue) {
      return Promise.resolve(this.endpointValue)
    }
    return new Promise((resolve, reject) => this.endpointWaiters.add({ resolve, reject }))
  }

  private resolveEndpointWaiters(endpoint: string): void {
    for (const waiter of this.endpointWaiters) {
      waiter.resolve(endpoint)
    }
    this.endpointWaiters.clear()
  }

  private rejectEndpointWaiters(error: Error): void {
    for (const waiter of this.endpointWaiters) {
      waiter.reject(error)
    }
    this.endpointWaiters.clear()
  }
}

async function closeHttpServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
