import { decodeTerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import {
  encodeRuntimeOrpcSocketFrame,
  RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY,
  RUNTIME_ORPC_SOCKET_PROTOCOL
} from '~shared/runtime-orpc-socket'

import { RuntimeClientError } from './types'

export type BinaryStreamListener = (bytes: Uint8Array<ArrayBufferLike>) => void

export class RuntimeOrpcSocketBinaryChannel {
  private readonly listeners = new Set<BinaryStreamListener>()
  private isNegotiated = false

  setCapabilities(capabilities: readonly string[] | undefined): void {
    this.isNegotiated = capabilities?.includes(RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY) === true
  }

  listen(listener: BinaryStreamListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  send(
    streamId: number,
    bytes: Uint8Array<ArrayBufferLike>,
    writeFrame: (frame: string) => void
  ): void {
    if (!this.isNegotiated) {
      throw unsupportedBinaryStream()
    }
    const terminalFrame = decodeTerminalMultiplexFrame(bytes)
    if (
      !Number.isSafeInteger(streamId) ||
      streamId < 0 ||
      !terminalFrame.ok ||
      terminalFrame.frame.routeId !== streamId
    ) {
      throw new RuntimeClientError(
        'invalid_binary_terminal_stream',
        'The terminal binary frame does not match its stream id.'
      )
    }
    writeFrame(
      encodeRuntimeOrpcSocketFrame({
        protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
        type: 'binary-stream',
        streamId,
        encoding: 'base64',
        data: Buffer.from(bytes).toString('base64')
      })
    )
  }

  handle(payload: string | ArrayBuffer): boolean {
    if (typeof payload === 'string') {
      return false
    }
    const bytes = new Uint8Array(payload)
    if (!decodeTerminalMultiplexFrame(bytes).ok) {
      return false
    }
    if (!this.isNegotiated) {
      throw unsupportedBinaryStream()
    }
    if (this.listeners.size === 0) {
      throw new RuntimeClientError(
        'binary_terminal_stream_unhandled',
        'The terminal binary stream has no client handler.'
      )
    }
    for (const listener of this.listeners) {
      listener(bytes)
    }
    return true
  }
}

function unsupportedBinaryStream(): RuntimeClientError {
  return new RuntimeClientError(
    'binary_terminal_stream_unsupported',
    'The runtime host did not negotiate inbound binary streams.'
  )
}
