import { createConnection, type Socket } from 'node:net'

import type { RuntimeMetadata } from '~shared/runtime-bootstrap'
import {
  encodeRuntimeOrpcSocketFrame,
  parseRuntimeOrpcSocketServerFrame,
  RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY,
  RUNTIME_ORPC_SOCKET_PROTOCOL,
  type RuntimeOrpcSocketMessageFrame
} from '~shared/runtime-orpc-socket'

import type {
  RuntimeOrpcSocketEvent,
  RuntimeOrpcSocketEventListener,
  RuntimeOrpcSocketLike
} from './orpc-client-types'
import { RuntimeOrpcSocketBinaryChannel, type BinaryStreamListener } from './socket-binary-channel'
import {
  invalidRuntimeOrpcSocketResponse,
  runtimeOrpcSocketIdentityError
} from './socket-connection-errors'
import {
  decodeRuntimeOrpcSocketPayload,
  runtimeOrpcSocketPayloadBytes
} from './socket-frame-payload'
import { RuntimeClientError } from './types'

const SOCKET_CONNECTING = 0
const SOCKET_OPEN = 1
const SOCKET_CLOSED = 3
const MAX_RUNTIME_RPC_MESSAGE_BYTES = 1024 * 1024

type ListenerRegistration = {
  listener: RuntimeOrpcSocketEventListener
  once: boolean
}

type AuthenticatedRuntimeMetadata = RuntimeMetadata & { authToken: string }

export class RuntimeOrpcSocketPeer implements RuntimeOrpcSocketLike {
  readyState = SOCKET_CONNECTING
  readonly requestId: string

  private readonly socket: Socket
  private readonly metadata: AuthenticatedRuntimeMetadata
  private readonly capabilities: readonly string[]
  private readonly binaryChannel = new RuntimeOrpcSocketBinaryChannel()
  private readonly listeners = new Map<string, Set<ListenerRegistration>>()
  private readonly timeout: NodeJS.Timeout
  private buffer = ''
  private failure: Error | null = null
  private isClosingNormally = false

  constructor(
    endpoint: string,
    metadata: AuthenticatedRuntimeMetadata,
    requestId: string,
    timeoutMs: number,
    capabilities: readonly string[] = [RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY]
  ) {
    this.metadata = metadata
    this.capabilities = capabilities
    this.requestId = requestId
    this.socket = createConnection(endpoint)
    this.socket.setEncoding('utf8')
    this.socket.setNoDelay(true)
    this.timeout = setTimeout(() => {
      this.fail(
        new RuntimeClientError(
          'runtime_timeout',
          'Timed out waiting for the Yiru runtime to respond.'
        )
      )
    }, timeoutMs)
    this.timeout.unref()

    this.socket.once('connect', () => this.sendHandshake())
    this.socket.once('error', () => {
      this.fail(
        new RuntimeClientError(
          'runtime_unavailable',
          'Could not connect to the running Yiru app. Restart Yiru and try again.'
        )
      )
    })
    this.socket.once('close', () => this.handleClose())
    this.socket.on('data', (chunk: string) => this.handleData(chunk))
  }

  addEventListener(
    type: 'open' | 'close' | 'message',
    listener: RuntimeOrpcSocketEventListener,
    options?: boolean | { once?: boolean }
  ): void {
    const registrations = this.listeners.get(type) ?? new Set<ListenerRegistration>()
    registrations.add({ listener, once: typeof options === 'object' && options.once === true })
    this.listeners.set(type, registrations)
  }

  removeEventListener(
    type: 'open' | 'close' | 'message',
    listener: RuntimeOrpcSocketEventListener
  ): void {
    const registrations = this.listeners.get(type)
    if (!registrations) {
      return
    }
    for (const registration of registrations) {
      if (registration.listener === listener) {
        registrations.delete(registration)
      }
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>): void {
    if (typeof data === 'string') {
      this.writeMessage({
        protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
        type: 'message',
        encoding: 'text',
        data
      })
      return
    }
    void runtimeOrpcSocketPayloadBytes(data)
      .then((bytes) => {
        this.writeMessage({
          protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
          type: 'message',
          encoding: 'base64',
          data: Buffer.from(bytes).toString('base64')
        })
      })
      .catch(() => {
        this.fail(invalidRuntimeOrpcSocketResponse())
      })
  }

  sendBinaryStream(streamId: number, bytes: Uint8Array<ArrayBufferLike>): void {
    this.binaryChannel.send(streamId, bytes, (frame) => this.writeFrame(frame))
  }

  onBinaryStream(listener: BinaryStreamListener): () => void {
    return this.binaryChannel.listen(listener)
  }

  close(): void {
    if (this.readyState === SOCKET_CLOSED) {
      return
    }
    this.isClosingNormally = true
    this.socket.destroy()
  }

  transportFailure(): Error | null {
    return this.failure
  }

  private sendHandshake(): void {
    this.writeFrame(
      encodeRuntimeOrpcSocketFrame({
        protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
        type: 'connect',
        requestId: this.requestId,
        runtimeId: this.metadata.runtimeId,
        authToken: this.metadata.authToken,
        capabilities: this.capabilities
      })
    )
  }

  private handleData(chunk: string): void {
    this.buffer += chunk
    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_RUNTIME_RPC_MESSAGE_BYTES) {
      this.fail(invalidRuntimeOrpcSocketResponse())
      return
    }
    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex !== -1 && this.readyState !== SOCKET_CLOSED) {
      const rawFrame = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (rawFrame) {
        this.handleFrame(rawFrame)
      }
      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  private handleFrame(rawFrame: string): void {
    const parsed = parseRuntimeOrpcSocketServerFrame(rawFrame)
    if (parsed.kind !== 'frame') {
      this.fail(invalidRuntimeOrpcSocketResponse())
      return
    }
    this.timeout.refresh()
    const frame = parsed.frame
    if (frame.type === 'keepalive') {
      return
    }
    if (frame.type === 'ready') {
      if (
        this.readyState !== SOCKET_CONNECTING ||
        frame.requestId !== this.requestId ||
        frame.runtimeId !== this.metadata.runtimeId
      ) {
        this.fail(
          runtimeOrpcSocketIdentityError(
            frame.requestId,
            frame.runtimeId,
            this.requestId,
            this.metadata.runtimeId
          )
        )
        return
      }
      this.binaryChannel.setCapabilities(frame.capabilities)
      this.readyState = SOCKET_OPEN
      this.emit('open', {})
      return
    }
    if (frame.type === 'error') {
      if (frame.requestId !== this.requestId || frame.runtimeId !== this.metadata.runtimeId) {
        this.fail(
          runtimeOrpcSocketIdentityError(
            frame.requestId,
            frame.runtimeId,
            this.requestId,
            this.metadata.runtimeId
          )
        )
        return
      }
      this.fail(new RuntimeClientError(frame.code, frame.message))
      return
    }
    if (this.readyState !== SOCKET_OPEN) {
      this.fail(invalidRuntimeOrpcSocketResponse())
      return
    }
    try {
      const payload = decodeRuntimeOrpcSocketPayload(frame)
      if (!this.binaryChannel.handle(payload)) {
        this.emit('message', { data: payload })
      }
    } catch (error) {
      this.fail(error instanceof RuntimeClientError ? error : invalidRuntimeOrpcSocketResponse())
    }
  }

  private writeMessage(frame: RuntimeOrpcSocketMessageFrame): void {
    if (this.readyState !== SOCKET_OPEN) {
      this.fail(invalidRuntimeOrpcSocketResponse())
      return
    }
    this.writeFrame(encodeRuntimeOrpcSocketFrame(frame))
  }

  private writeFrame(frame: string): void {
    if (Buffer.byteLength(frame, 'utf8') > MAX_RUNTIME_RPC_MESSAGE_BYTES) {
      this.fail(new RuntimeClientError('request_too_large', 'RPC request exceeds the maximum size'))
      return
    }
    if (!this.socket.destroyed && this.socket.writable) {
      this.socket.write(`${frame}\n`)
    }
  }

  private fail(error: Error): void {
    this.failure ??= error
    this.socket.destroy()
  }

  private handleClose(): void {
    clearTimeout(this.timeout)
    if (!this.failure && !this.isClosingNormally) {
      this.failure = new RuntimeClientError(
        'runtime_unavailable',
        'The Yiru runtime closed the connection before responding. Restart Yiru and try again.'
      )
    }
    this.readyState = SOCKET_CLOSED
    this.emit('close', {})
  }

  private emit(type: 'open' | 'close' | 'message', event: RuntimeOrpcSocketEvent): void {
    const registrations = this.listeners.get(type)
    if (!registrations) {
      return
    }
    for (const registration of Array.from(registrations)) {
      if (registration.once) {
        registrations.delete(registration)
      }
      registration.listener(event)
    }
  }
}
