import { timingSafeEqual } from 'node:crypto'

import type { AnyRouter } from '@orpc/server'
import type { MinimalWebsocket } from '@orpc/server/websocket'
import type { ServerWebSocket } from 'bun'

import type {
  WorkbenchShellServicesBridge,
  WorkbenchShellServicesTransport,
  WorkbenchRuntimeBridge,
  WorkbenchRuntimeConnectionTransport
} from '../workbench/runtime'
import { isDaemonWebSocketOriginAllowed } from './origin'

export const EXTENSION_PROTOCOL_VERSION = 1
const EXTENSION_RPC_PATH = '/rpc'
const MAX_WS_MESSAGE_BYTES = 1024 * 1024
const MAX_WS_BACKPRESSURE_BYTES = 4 * 1024 * 1024

type ExtensionSocketData = {
  connectionId: string
}

export type ExtensionServerOptions = {
  allowedOrigins: ReadonlySet<string>
  authToken: string
  hostname: string
  port: number
  consumeArtifactTicket: (
    id: string,
    ticket: string | null
  ) => {
    byteLength: number
    fileName: string
    mimeType: string
    path: string
  } | null
  cleanupConnection?: (connectionId: string) => void
  createContext?: WorkbenchRuntimeBridge['createContext']
  createRpcHandler: WorkbenchRuntimeBridge['createRpcHandler']
  handleBinary: WorkbenchRuntimeBridge['handleBinary']
  router: AnyRouter
  runtimeId: string
  shellServices: WorkbenchShellServicesBridge
}

export type ExtensionServer = {
  connectedClientCount: () => number
  endpoint: string
  protocolVersion: number
  shutdown: () => Promise<void>
}

export function startExtensionServer(options: ExtensionServerOptions): ExtensionServer {
  const expectedTokenHash = hashCredential(options.authToken)
  const handler = options.createRpcHandler(options.router)
  const peers = new Map<
    ServerWebSocket<ExtensionSocketData>,
    {
      context: Record<string, unknown>
      peer: BunOrpcPeer
      shellTransport: WorkbenchShellServicesTransport
    }
  >()
  const server = Bun.serve<ExtensionSocketData>({
    hostname: options.hostname,
    port: options.port,
    fetch(request, bunServer) {
      const url = new URL(request.url)
      const origin = request.headers.get('origin')
      if (request.headers.get('host') !== url.host) {
        return new Response('Host not allowed', { status: 403 })
      }
      if (origin !== null && !isDaemonWebSocketOriginAllowed(origin, options.allowedOrigins)) {
        return new Response('Origin not allowed', { status: 403 })
      }
      if (Number(url.searchParams.get('protocolVersion')) !== EXTENSION_PROTOCOL_VERSION) {
        return new Response('Protocol version mismatch', { status: 426 })
      }
      if (url.pathname.startsWith('/artifacts/')) {
        if (request.method !== 'GET') {
          return new Response('Method not allowed', { status: 405 })
        }
        const id = url.pathname.slice('/artifacts/'.length)
        const artifact = /^[0-9a-f-]{36}$/i.test(id)
          ? options.consumeArtifactTicket(id, url.searchParams.get('downloadTicket'))
          : null
        if (!artifact) {
          return new Response('Artifact not found', { status: 404 })
        }
        return new Response(Bun.file(artifact.path), {
          headers: {
            'cache-control': 'private, no-store',
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
            'content-length': String(artifact.byteLength),
            'content-type': artifact.mimeType,
            'x-content-type-options': 'nosniff'
          }
        })
      }
      if (!isCredentialEqual(url.searchParams.get('token'), expectedTokenHash)) {
        return new Response('Unauthorized', { status: 401 })
      }
      if (url.pathname === '/health') {
        return Response.json({
          ok: true,
          protocolVersion: EXTENSION_PROTOCOL_VERSION,
          runtimeId: options.runtimeId
        })
      }
      if (url.pathname !== EXTENSION_RPC_PATH) {
        return new Response('Not found', { status: 404 })
      }
      const upgraded = bunServer.upgrade(request, {
        data: { connectionId: crypto.randomUUID() }
      })
      return upgraded ? undefined : new Response('WebSocket upgrade required', { status: 400 })
    },
    websocket: {
      backpressureLimit: MAX_WS_BACKPRESSURE_BYTES,
      closeOnBackpressureLimit: true,
      idleTimeout: 0,
      maxPayloadLength: MAX_WS_MESSAGE_BYTES,
      sendPings: false,
      open(socket) {
        const peer = new BunOrpcPeer(() => socket.close(1011, 'oRPC send failed'))
        peer.bind(socket)
        const shellTransport = createShellTransport(socket)
        const runtimeTransport = createRuntimeTransport(socket)
        const context = options.createContext?.(socket.data.connectionId, runtimeTransport) ?? {
          client: 'extension',
          connectionId: socket.data.connectionId
        }
        peers.set(socket, { context, peer, shellTransport })
      },
      message(socket, message) {
        const connection = peers.get(socket)
        if (!connection) {
          socket.close(1011, 'oRPC peer unavailable')
          return
        }
        const normalized = normalizeMessage(message)
        if (
          options.shellServices.handleMessage(
            socket.data.connectionId,
            typeof normalized === 'string' ? normalized : new Uint8Array(normalized),
            connection.shellTransport
          )
        ) {
          return
        }
        if (
          normalized instanceof ArrayBuffer &&
          options.handleBinary(socket.data.connectionId, new Uint8Array(normalized))
        ) {
          return
        }
        void handler
          .message(connection.peer, normalized, connection.context)
          .catch((error: unknown) => {
            console.error('[daemon] oRPC peer message failed', error)
            socket.close(1003, 'Invalid oRPC peer message')
          })
      },
      close(socket) {
        const connection = peers.get(socket)
        if (!connection) {
          return
        }
        handler.close(connection.peer)
        options.shellServices.close(socket.data.connectionId, connection.shellTransport)
        connection.peer.close()
        peers.delete(socket)
        options.cleanupConnection?.(socket.data.connectionId)
      }
    }
  })
  return {
    connectedClientCount: () => peers.size,
    endpoint: `ws://${server.hostname}:${server.port}${EXTENSION_RPC_PATH}`,
    protocolVersion: EXTENSION_PROTOCOL_VERSION,
    shutdown: async () => {
      for (const socket of peers.keys()) {
        socket.close(1001, 'Daemon shutting down')
      }
      await server.stop(true)
    }
  }
}

function createRuntimeTransport(
  socket: ServerWebSocket<ExtensionSocketData>
): WorkbenchRuntimeConnectionTransport {
  return {
    bufferedBytes: () => socket.getBufferedAmount(),
    close: (code, reason) => socket.close(code, reason),
    sendBinary: (payload) => socket.send(payload) !== 0
  }
}

function createShellTransport(
  socket: ServerWebSocket<ExtensionSocketData>
): WorkbenchShellServicesTransport {
  return {
    close: (code) => socket.close(code),
    identity: socket,
    sendBinary: (payload) => socket.send(payload) !== 0,
    sendText: (payload) => socket.send(payload) !== 0
  }
}

function hashCredential(value: string): Uint8Array {
  return new Bun.CryptoHasher('sha256').update(value).digest()
}

function isCredentialEqual(candidate: string | null, expectedHash: Uint8Array): boolean {
  if (candidate === null) {
    return false
  }
  return timingSafeEqual(hashCredential(candidate), expectedHash)
}

class BunOrpcPeer {
  private readonly onSendFailure: () => void
  private socket: ServerWebSocket<ExtensionSocketData> | null = null
  readonly addEventListener: MinimalWebsocket['addEventListener'] = () => {}
  readonly send: MinimalWebsocket['send'] = (data) => {
    if (data instanceof Blob) {
      void data.arrayBuffer().then((buffer) => this.sendValue(buffer), this.onSendFailure)
      return
    }
    this.sendValue(data)
  }

  private sendValue(data: string | ArrayBufferLike | ArrayBufferView<ArrayBufferLike>): void {
    const value = typeof data === 'string' ? data : copyBytes(data)
    if (!this.socket || this.socket.send(value) === 0) {
      this.onSendFailure()
    }
  }

  constructor(onSendFailure: () => void) {
    this.onSendFailure = onSendFailure
  }

  bind(socket: ServerWebSocket<ExtensionSocketData>): void {
    this.socket = socket
  }

  close(): void {
    this.socket = null
  }
}

function copyBytes(
  value: ArrayBufferLike | ArrayBufferView<ArrayBufferLike>
): Uint8Array<ArrayBuffer> {
  const source = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  return copy
}

function normalizeMessage(message: string | Buffer<ArrayBuffer>): string | ArrayBuffer {
  if (typeof message === 'string') {
    return message
  }
  const copy = new Uint8Array(message.byteLength)
  copy.set(message)
  return copy.buffer
}
