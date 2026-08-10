import type { MinimalWebsocket } from '@orpc/server/websocket'
import {
  encodeRuntimeOrpcSocketFrame,
  parseRuntimeOrpcSocketClientFrame,
  RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY,
  RUNTIME_ORPC_SOCKET_PROTOCOL,
  type RuntimeOrpcSocketBinaryStreamFrame,
  type RuntimeOrpcSocketConnectFrame,
  type RuntimeOrpcSocketMessageFrame
} from '~shared/runtime-orpc-socket'

import type {
  UnixSocketProtocolConnection,
  UnixSocketProtocolHandler
} from '../unix-socket-transport'

type RuntimeOrpcSocketProtocolState<TContext> = {
  peer: RuntimeOrpcSocketPeer
  context: TContext
  requestId: string
  supportsInboundBinaryStreams: boolean
}

type RuntimeOrpcSocketProtocolHandlerOptions<TContext> = {
  authToken: string
  getRuntimeId: () => string
  createContext: (
    frame: RuntimeOrpcSocketConnectFrame,
    connection: UnixSocketProtocolConnection,
    peer: MinimalWebsocket
  ) => TContext
  message: (
    peer: MinimalWebsocket,
    payload: string | ArrayBuffer,
    context: TContext
  ) => Promise<void>
  binaryStream?: (streamId: number, payload: Uint8Array, context: TContext) => boolean
  close: (peer: MinimalWebsocket) => void
  closeContext?: (context: TContext) => void
}

export class RuntimeOrpcSocketProtocolHandler<TContext> implements UnixSocketProtocolHandler {
  private readonly states = new Map<
    UnixSocketProtocolConnection,
    RuntimeOrpcSocketProtocolState<TContext>
  >()
  private readonly options: RuntimeOrpcSocketProtocolHandlerOptions<TContext>

  constructor(options: RuntimeOrpcSocketProtocolHandlerOptions<TContext>) {
    this.options = options
  }

  open(rawFrame: string, connection: UnixSocketProtocolConnection): boolean {
    const parsed = parseRuntimeOrpcSocketClientFrame(rawFrame)
    if (parsed.kind === 'other') {
      return false
    }
    if (parsed.kind === 'invalid' || parsed.frame.type !== 'connect') {
      const requestId = parsed.kind === 'invalid' ? parsed.requestId : undefined
      this.reject(connection, requestId ?? 'unknown', 'bad_request', 'Invalid oRPC handshake')
      return true
    }

    const frame = parsed.frame
    if (frame.authToken !== this.options.authToken) {
      this.reject(connection, frame.requestId, 'unauthorized', 'Invalid auth token')
      return true
    }
    const runtimeId = this.options.getRuntimeId()
    if (frame.runtimeId !== runtimeId) {
      this.reject(
        connection,
        frame.requestId,
        'runtime_unavailable',
        'The Yiru runtime changed while the request was in flight. Retry the command.'
      )
      return true
    }

    const peer = new RuntimeOrpcSocketPeer(connection)
    const context = this.options.createContext(frame, connection, peer)
    const supportsInboundBinaryStreams =
      this.options.binaryStream !== undefined &&
      frame.capabilities?.includes(RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY) === true
    this.states.set(connection, {
      peer,
      context,
      requestId: frame.requestId,
      supportsInboundBinaryStreams
    })
    if (
      !connection.send(
        encodeRuntimeOrpcSocketFrame({
          protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
          type: 'ready',
          requestId: frame.requestId,
          runtimeId,
          ...(supportsInboundBinaryStreams
            ? { capabilities: [RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY] }
            : {})
        })
      )
    ) {
      connection.close()
    }
    return true
  }

  message(rawFrame: string, connection: UnixSocketProtocolConnection): void {
    const state = this.states.get(connection)
    const parsed = parseRuntimeOrpcSocketClientFrame(rawFrame)
    if (!state || parsed.kind !== 'frame') {
      connection.close()
      return
    }
    if (parsed.frame.type === 'binary-stream') {
      this.handleBinaryStream(parsed.frame, state, connection)
      return
    }
    if (parsed.frame.type !== 'message') {
      connection.close()
      return
    }
    let payload: string | ArrayBuffer
    try {
      payload = decodePayload(parsed.frame)
    } catch {
      connection.close()
      return
    }
    void this.options.message(state.peer, payload, state.context).catch(() => connection.close())
  }

  private handleBinaryStream(
    frame: RuntimeOrpcSocketBinaryStreamFrame,
    state: RuntimeOrpcSocketProtocolState<TContext>,
    connection: UnixSocketProtocolConnection
  ): void {
    if (!state.supportsInboundBinaryStreams || !this.options.binaryStream) {
      this.reject(
        connection,
        state.requestId,
        'binary_terminal_stream_unsupported',
        'The runtime host did not negotiate inbound binary streams.'
      )
      return
    }
    let payload: Uint8Array
    try {
      payload = decodeBinaryStreamPayload(frame)
    } catch {
      this.reject(
        connection,
        state.requestId,
        'invalid_binary_terminal_stream',
        'The runtime host received an invalid binary stream frame.'
      )
      return
    }
    if (this.options.binaryStream(frame.streamId, payload, state.context)) {
      return
    }
    this.reject(
      connection,
      state.requestId,
      'binary_terminal_stream_unhandled',
      'The runtime host has no handler for this binary stream.'
    )
  }

  close(connection: UnixSocketProtocolConnection): void {
    const state = this.states.get(connection)
    if (!state) {
      return
    }
    this.options.close(state.peer)
    this.options.closeContext?.(state.context)
    state.peer.close()
    this.states.delete(connection)
  }

  private reject(
    connection: UnixSocketProtocolConnection,
    requestId: string,
    code: string,
    message: string
  ): void {
    connection.send(
      encodeRuntimeOrpcSocketFrame({
        protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
        type: 'error',
        requestId,
        runtimeId: this.options.getRuntimeId(),
        code,
        message
      })
    )
    connection.close()
  }
}

function decodeBinaryStreamPayload(frame: RuntimeOrpcSocketBinaryStreamFrame): Uint8Array {
  const bytes = Buffer.from(frame.data, 'base64')
  if (bytes.toString('base64') !== frame.data) {
    throw new Error('Invalid base64 binary stream payload')
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

class RuntimeOrpcSocketPeer {
  private sendQueue = Promise.resolve()
  private readonly connection: UnixSocketProtocolConnection

  readonly addEventListener: MinimalWebsocket['addEventListener'] = () => {}
  readonly send: MinimalWebsocket['send'] = (data) => {
    this.sendQueue = this.sendQueue
      .then(() => this.sendPayload(data))
      .catch(() => this.connection.close())
  }

  constructor(connection: UnixSocketProtocolConnection) {
    this.connection = connection
  }

  close(): void {
    this.sendQueue = Promise.resolve()
  }

  private async sendPayload(
    data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
  ): Promise<void> {
    const frame: RuntimeOrpcSocketMessageFrame =
      typeof data === 'string'
        ? {
            protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
            type: 'message',
            encoding: 'text',
            data
          }
        : {
            protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
            type: 'message',
            encoding: 'base64',
            data: Buffer.from(await payloadBytes(data)).toString('base64')
          }
    if (!this.connection.send(encodeRuntimeOrpcSocketFrame(frame))) {
      throw new Error('oRPC socket is not writable')
    }
  }
}

function decodePayload(frame: RuntimeOrpcSocketMessageFrame): string | ArrayBuffer {
  if (frame.encoding === 'text') {
    return frame.data
  }
  const bytes = Buffer.from(frame.data, 'base64')
  if (bytes.toString('base64') !== frame.data) {
    throw new Error('Invalid base64 oRPC socket payload')
  }
  return arrayBufferOf(bytes)
}

async function payloadBytes(
  data: ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
): Promise<Uint8Array<ArrayBufferLike>> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return new Uint8Array(data)
}

function arrayBufferOf(bytes: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
