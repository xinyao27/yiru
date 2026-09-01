import type { AnyRouter } from '@orpc/server'
import {
  decodeRuntimeOrpcBinaryFrame,
  decodeRuntimeOrpcTextFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'
import type { ServerWebSocket } from 'bun'

import type {
  WorkbenchRpcHandler,
  WorkbenchRuntimeBridge,
  WorkbenchRuntimeClientIdentity,
  WorkbenchRuntimeConnectionTransport
} from '../workbench/runtime'
import type { MobileDeviceStore } from './devices'
import { MobileE2EESession } from './e2ee-session'
import type { MobileKeypair } from './keypair'
import { copyMobileArrayBuffer, MobileOrpcPeer, normalizeMobileMessage } from './orpc-peer'

const MOBILE_PATH = '/mobile'
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024
const MAX_BACKPRESSURE_BYTES = 8 * 1024 * 1024

type MobileSocketData = { connectionId: string }

export type MobileServerOptions = {
  cleanupConnection: WorkbenchRuntimeBridge['cleanupConnection']
  createContext: WorkbenchRuntimeBridge['createContext']
  createRpcHandler: WorkbenchRuntimeBridge['createRpcHandler']
  devices: MobileDeviceStore
  handleBinary: WorkbenchRuntimeBridge['handleBinary']
  keypair: MobileKeypair
  port: number
  router: AnyRouter
  runtimeId: string
}

export type MobileServer = {
  isDeviceConnected: (deviceId: string) => boolean
  endpoint: string
  shutdown: () => Promise<void>
}

export function startMobileServer(options: MobileServerOptions): MobileServer {
  const handler = options.createRpcHandler(options.router)
  const connections = new Map<ServerWebSocket<MobileSocketData>, MobileConnection>()
  const serve = (port: number) =>
    Bun.serve<MobileSocketData>({
      hostname: '0.0.0.0',
      port,
      fetch(request, server) {
        const url = new URL(request.url)
        if (request.headers.get('origin') !== null) {
          return new Response('Browser origins are not allowed', { status: 403 })
        }
        if (url.pathname !== MOBILE_PATH) {
          return new Response('Not found', { status: 404 })
        }
        const upgraded = server.upgrade(request, {
          data: { connectionId: crypto.randomUUID() }
        })
        return upgraded ? undefined : new Response('WebSocket upgrade required', { status: 400 })
      },
      websocket: {
        backpressureLimit: MAX_BACKPRESSURE_BYTES,
        closeOnBackpressureLimit: true,
        idleTimeout: 0,
        maxPayloadLength: MAX_MESSAGE_BYTES,
        sendPings: true,
        open(socket) {
          connections.set(
            socket,
            new MobileConnection(
              socket,
              handler,
              options.devices,
              options.cleanupConnection,
              options.createContext,
              options.handleBinary,
              options.keypair,
              options.runtimeId
            )
          )
        },
        message(socket, message) {
          connections.get(socket)?.enqueue(normalizeMobileMessage(message))
        },
        close(socket) {
          connections.get(socket)?.close()
          connections.delete(socket)
        }
      }
    })
  let server: ReturnType<typeof serve>
  try {
    server = serve(options.port)
  } catch {
    server = serve(0)
  }
  return {
    isDeviceConnected: (deviceId) =>
      [...connections.values()].some((connection) => connection.deviceId === deviceId),
    endpoint: `ws://127.0.0.1:${server.port}${MOBILE_PATH}`,
    shutdown: async () => {
      for (const socket of connections.keys()) {
        socket.close(1001, 'Daemon shutting down')
      }
      await server.stop(true)
    }
  }
}

class MobileConnection {
  private isAuthenticated = false
  private isClosed = false
  private readonly cleanupConnection: WorkbenchRuntimeBridge['cleanupConnection']
  private readonly createContext: WorkbenchRuntimeBridge['createContext']
  private readonly devices: MobileDeviceStore
  private authenticatedDeviceId: string | null = null
  private readonly handler: WorkbenchRpcHandler
  private readonly handleBinary: WorkbenchRuntimeBridge['handleBinary']
  private readonly keypair: MobileKeypair
  private readonly peer: MobileOrpcPeer
  private queue = Promise.resolve()
  private readonly runtimeId: string
  private runtimeContext: Record<string, unknown> | null = null
  private session: MobileE2EESession | null = null
  private readonly socket: ServerWebSocket<MobileSocketData>

  constructor(
    socket: ServerWebSocket<MobileSocketData>,
    handler: WorkbenchRpcHandler,
    devices: MobileDeviceStore,
    cleanupConnection: WorkbenchRuntimeBridge['cleanupConnection'],
    createContext: WorkbenchRuntimeBridge['createContext'],
    handleBinary: WorkbenchRuntimeBridge['handleBinary'],
    keypair: MobileKeypair,
    runtimeId: string
  ) {
    this.cleanupConnection = cleanupConnection
    this.createContext = createContext
    this.devices = devices
    this.handler = handler
    this.handleBinary = handleBinary
    this.keypair = keypair
    this.runtimeId = runtimeId
    this.socket = socket
    this.peer = new MobileOrpcPeer(
      (text) => this.sendText(text),
      (bytes) => this.sendBinary(bytes),
      () => socket.close(1011, 'Mobile oRPC send failed')
    )
  }

  get deviceId(): string | null {
    return this.authenticatedDeviceId
  }

  enqueue(message: string | Uint8Array): void {
    this.queue = this.queue
      .then(() => this.handle(message))
      .catch(() => this.socket.close(1003, 'Invalid mobile message'))
  }

  close(): void {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    this.handler.close(this.peer)
    this.cleanupConnection(this.socket.data.connectionId)
    this.peer.close()
  }

  private async handle(message: string | Uint8Array): Promise<void> {
    if (!this.session) {
      if (typeof message !== 'string') {
        throw new Error('mobile_hello_must_be_text')
      }
      const hello: unknown = JSON.parse(message)
      const session = MobileE2EESession.create(hello, this.keypair.secretKey)
      if (!session) {
        throw new Error('mobile_hello_invalid')
      }
      this.session = session
      this.socket.send(JSON.stringify(session.ready))
      return
    }
    const plaintext =
      typeof message === 'string'
        ? this.session.openText(message)
        : this.session.openBinary(message)
    if (plaintext === null) {
      throw new Error('mobile_frame_invalid')
    }
    if (!this.isAuthenticated) {
      if (typeof plaintext !== 'string') {
        throw new Error('mobile_auth_must_be_text')
      }
      this.authenticate(plaintext)
      return
    }
    if (typeof plaintext === 'string') {
      const payload = decodeRuntimeOrpcTextFrame(plaintext)
      if (payload === null) {
        throw new Error('mobile_orpc_text_frame_invalid')
      }
      await this.handler.message(this.peer, payload, {
        context: this.requireRuntimeContext()
      })
      return
    }
    const payload = decodeRuntimeOrpcBinaryFrame(plaintext)
    if (payload === null) {
      throw new Error('mobile_orpc_binary_frame_invalid')
    }
    if (this.handleBinary(this.socket.data.connectionId, payload)) {
      return
    }
    await this.handler.message(this.peer, copyMobileArrayBuffer(payload), {
      context: this.requireRuntimeContext()
    })
  }

  private authenticate(plaintext: string): void {
    const value: unknown = JSON.parse(plaintext)
    if (typeof value !== 'object' || value === null) {
      throw new Error('mobile_auth_invalid')
    }
    const token = Reflect.get(value, 'deviceToken')
    const transcriptHash = Reflect.get(value, 'transcriptHashB64')
    if (
      Reflect.get(value, 'type') !== 'e2ee_auth' ||
      Reflect.get(value, 'v') !== 2 ||
      typeof token !== 'string' ||
      transcriptHash !== this.session?.transcriptHashB64
    ) {
      throw new Error('mobile_auth_invalid')
    }
    const device = this.devices.validateToken(token)
    if (!device) {
      throw new Error('mobile_auth_unauthorized')
    }
    this.devices.markSeen(device.id)
    this.authenticatedDeviceId = device.id
    const identity: WorkbenchRuntimeClientIdentity = {
      deviceId: device.id,
      deviceToken: token,
      isAuthorized: () => this.devices.validateToken(token)?.id === device.id,
      kind: 'mobile'
    }
    const transport: WorkbenchRuntimeConnectionTransport = {
      bufferedBytes: () => this.socket.getBufferedAmount(),
      close: (code, reason) => this.socket.close(code, reason),
      sendBinary: (payload) => this.peer.sendBinaryPayload(payload)
    }
    this.runtimeContext = this.createContext(this.socket.data.connectionId, transport, identity)
    this.isAuthenticated = true
    const session = this.session
    if (!session) {
      throw new Error('mobile_session_unavailable')
    }
    this.sendText(
      JSON.stringify({
        runtimeId: this.runtimeId,
        transcriptHashB64: session.transcriptHashB64,
        type: 'e2ee_authenticated',
        v: 2
      })
    )
  }

  private requireRuntimeContext(): Record<string, unknown> {
    if (!this.runtimeContext) {
      throw new Error('mobile_runtime_context_unavailable')
    }
    return this.runtimeContext
  }

  private sendText(plaintext: string): boolean {
    return this.session !== null && this.socket.send(this.session.sealText(plaintext)) !== 0
  }

  private sendBinary(plaintext: Uint8Array): boolean {
    return this.session !== null && this.socket.send(this.session.sealBinary(plaintext)) !== 0
  }
}
