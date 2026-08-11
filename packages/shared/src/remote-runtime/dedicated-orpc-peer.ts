import type { RPCLinkOptions } from '@orpc/client/websocket' with { 'resolution-mode': 'import' }
import {
  decodeRuntimeOrpcBinaryFrame,
  decodeRuntimeOrpcTextFrame,
  encodeRuntimeOrpcBinaryFrame,
  encodeRuntimeOrpcTextFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'

import { decodeTerminalStreamFrame } from '../terminal/stream-protocol'

type DedicatedOrpcWebsocket = RPCLinkOptions<Record<never, never>>['websocket']
type DedicatedOrpcEvent = 'message' | 'close'

const WEBSOCKET_OPEN = 1
const WEBSOCKET_CLOSED = 3

export class DedicatedRemoteRuntimeOrpcPeer {
  private readonly listeners = new Map<
    DedicatedOrpcEvent,
    Set<EventListenerOrEventListenerObject>
  >()
  private sendQueue = Promise.resolve()
  readyState: DedicatedOrpcWebsocket['readyState'] = WEBSOCKET_OPEN

  constructor(
    private readonly sendText: (frame: string) => boolean,
    private readonly sendBinary: (frame: Uint8Array<ArrayBufferLike>) => boolean,
    private readonly onTerminalBinary: (frame: Uint8Array<ArrayBufferLike>) => void
  ) {}

  readonly addEventListener: DedicatedOrpcWebsocket['addEventListener'] = (type, listener) => {
    if (type !== 'message' && type !== 'close') {
      return
    }
    let listeners = this.listeners.get(type)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(type, listeners)
    }
    listeners.add(listener)
  }

  readonly removeEventListener: DedicatedOrpcWebsocket['removeEventListener'] = (
    type,
    listener
  ) => {
    if (type === 'message' || type === 'close') {
      this.listeners.get(type)?.delete(listener)
    }
  }

  readonly send: DedicatedOrpcWebsocket['send'] = (data) => {
    this.sendQueue = this.sendQueue.then(() => this.sendFrame(data)).catch(() => this.close())
  }

  receiveText(frame: string): boolean {
    const payload = decodeRuntimeOrpcTextFrame(frame)
    if (payload === null) {
      return false
    }
    this.emitMessage(payload)
    return true
  }

  receiveBinary(frame: Uint8Array<ArrayBufferLike>): boolean {
    const orpcPayload = decodeRuntimeOrpcBinaryFrame(frame)
    if (orpcPayload) {
      this.emitMessage(orpcPayload)
      return true
    }
    if (!decodeTerminalStreamFrame(frame)) {
      return false
    }
    this.onTerminalBinary(frame)
    return true
  }

  close(): void {
    if (this.readyState === WEBSOCKET_CLOSED) {
      return
    }
    this.readyState = WEBSOCKET_CLOSED
    this.dispatch('close', new Event('close'))
    this.listeners.clear()
  }

  private emitMessage(data: unknown): void {
    this.dispatch('message', new MessageEvent('message', { data }))
  }

  private dispatch(type: DedicatedOrpcEvent, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(this, event)
      } else {
        listener.handleEvent(event)
      }
    }
  }

  private async sendFrame(
    data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
  ): Promise<void> {
    if (this.readyState !== WEBSOCKET_OPEN) {
      throw new Error('The dedicated oRPC channel is closed')
    }
    const sent =
      typeof data === 'string'
        ? this.sendText(encodeRuntimeOrpcTextFrame(data))
        : this.sendBinary(encodeRuntimeOrpcBinaryFrame(await websocketDataBytes(data)))
    if (!sent) {
      throw new Error('The dedicated oRPC channel is not writable')
    }
  }
}

async function websocketDataBytes(
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
