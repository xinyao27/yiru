import { createORPCClient } from '@orpc/client'
import { RPCLink, type RPCLinkOptions } from '@orpc/client/websocket'
import {
  decodeShellServicesOrpcBinaryFrame,
  decodeShellServicesOrpcTextFrame,
  encodeShellServicesOrpcBinaryFrame,
  encodeShellServicesOrpcTextFrame,
  isShellServicesOrpcConnectFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'

import { webShellServicesConnectionId } from './shell-services-identity'
import {
  type ShellServicesConnection,
  type ShellServicesClient,
  removeShellServicesConnection,
  replaceShellServicesConnection
} from './shell-services-reverse-link'

type ShellServicesWebsocket = RPCLinkOptions<Record<never, never>>['websocket']
type ShellServicesWebsocketEvent = 'close' | 'message'
const WEBSOCKET_OPEN = 1
const WEBSOCKET_CLOSED = 3

type RuntimeShellServicesWsState = {
  connection: ShellServicesConnection
  peer: RuntimeShellServicesWsPeer
}

export type RuntimeShellServicesSocket = {
  close: (code?: number) => void
  connectionId: string
  identity: object
  sendBinary: (plaintext: Uint8Array<ArrayBufferLike>) => boolean
  sendText: (plaintext: string) => boolean
  shellConnectionId?: string
}

export class RuntimeShellServicesWsLinks {
  private readonly states = new Map<object, RuntimeShellServicesWsState>()

  handleText(socket: RuntimeShellServicesSocket, frame: string): boolean {
    if (isShellServicesOrpcConnectFrame(frame)) {
      this.connect(socket)
      return true
    }
    const payload = decodeShellServicesOrpcTextFrame(frame)
    if (payload === null) {
      return false
    }
    const state = this.states.get(socket.identity)
    if (!state) {
      socket.close(1003)
      return true
    }
    state.peer.receive(payload)
    return true
  }

  handleBinary(socket: RuntimeShellServicesSocket, frame: Uint8Array<ArrayBufferLike>): boolean {
    const payload = decodeShellServicesOrpcBinaryFrame(frame)
    if (payload === null) {
      return false
    }
    const state = this.states.get(socket.identity)
    if (!state) {
      socket.close(1003)
      return true
    }
    state.peer.receive(arrayBufferOf(payload))
    return true
  }

  close(socket: RuntimeShellServicesSocket): void {
    this.states.get(socket.identity)?.connection.close()
  }

  private connect(socket: RuntimeShellServicesSocket): void {
    this.states.get(socket.identity)?.connection.close()
    const shellConnectionId =
      socket.shellConnectionId ?? webShellServicesConnectionId(socket.connectionId)
    const peer = new RuntimeShellServicesWsPeer(socket)
    const link = new RPCLink<Record<never, never>>({ websocket: peer })
    const client = createORPCClient<ShellServicesClient>(link)
    let isClosed = false
    const connection: ShellServicesConnection = {
      client,
      close: (): void => {
        if (isClosed) {
          return
        }
        isClosed = true
        const state = this.states.get(socket.identity)
        if (state?.connection === connection) {
          this.states.delete(socket.identity)
        }
        removeShellServicesConnection(shellConnectionId, connection)
        peer.close()
      }
    }
    this.states.set(socket.identity, { connection, peer })
    replaceShellServicesConnection(shellConnectionId, connection)
    void client
      .ping()
      .then((result) => {
        if (!isClosed) {
          console.info('[shell-services] web reverse ping ok', { shellConnectionId, ...result })
        }
      })
      .catch((error) => {
        if (!isClosed) {
          console.error('[shell-services] web reverse ping failed', { shellConnectionId, error })
        }
      })
  }
}

class RuntimeShellServicesWsPeer {
  private readonly listeners = new Map<
    ShellServicesWebsocketEvent,
    Set<EventListenerOrEventListenerObject>
  >()
  private sendQueue = Promise.resolve()
  readyState: ShellServicesWebsocket['readyState'] = WEBSOCKET_OPEN

  readonly addEventListener: ShellServicesWebsocket['addEventListener'] = (
    type: string,
    listener: EventListenerOrEventListenerObject
  ) => {
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

  readonly removeEventListener: ShellServicesWebsocket['removeEventListener'] = (
    type: string,
    listener: EventListenerOrEventListenerObject
  ) => {
    if (type === 'message' || type === 'close') {
      this.listeners.get(type)?.delete(listener)
    }
  }

  readonly send: ShellServicesWebsocket['send'] = (data) => {
    this.sendQueue = this.sendQueue
      .then(() => this.sendFrame(data))
      .catch(() => this.socket.close(1013))
  }

  private readonly socket: RuntimeShellServicesSocket

  constructor(socket: RuntimeShellServicesSocket) {
    this.socket = socket
  }

  receive(data: string | ArrayBuffer): void {
    this.dispatch('message', new MessageEvent('message', { data }))
  }

  close(): void {
    if (this.readyState === WEBSOCKET_CLOSED) {
      return
    }
    this.readyState = WEBSOCKET_CLOSED
    this.dispatch('close', new Event('close'))
    this.listeners.clear()
  }

  private dispatch(type: ShellServicesWebsocketEvent, event: Event): void {
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
      throw new Error('Shell services peer is closed')
    }
    const sent =
      typeof data === 'string'
        ? this.socket.sendText(encodeShellServicesOrpcTextFrame(data))
        : this.socket.sendBinary(encodeShellServicesOrpcBinaryFrame(await websocketDataBytes(data)))
    if (!sent) {
      throw new Error('Shell services peer is not writable')
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

function arrayBufferOf(bytes: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
