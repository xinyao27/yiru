import type { RPCLinkOptions } from '@orpc/client/websocket'

import { WebShellServicesChannel } from '../../web/shell-services-channel'

type RpcWebSocket = RPCLinkOptions<Record<never, never>>['websocket']

export class ExtensionSocketMultiplexer {
  private isClosed = false
  private readonly rpcPeer: ExtensionRpcSocket
  private readonly shellServices: WebShellServicesChannel
  private readonly socket: WebSocket

  constructor(socket: WebSocket) {
    this.socket = socket
    this.socket.binaryType = 'arraybuffer'
    this.rpcPeer = new ExtensionRpcSocket(socket)
    this.shellServices = new WebShellServicesChannel(
      (payload) => this.send(payload),
      (payload) => this.send(payload),
      () => socket.close(1011, 'Shell services failed')
    )
    socket.addEventListener('message', this.handleMessage)
    socket.addEventListener('close', this.handleClose)
    socket.addEventListener('error', this.handleError)
  }

  get rpcSocket(): RpcWebSocket {
    return this.rpcPeer
  }

  connectShellServices(): boolean {
    return this.shellServices.connect()
  }

  close(): void {
    this.finishClose()
  }

  private finishClose(event?: CloseEvent): void {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    this.socket.removeEventListener('message', this.handleMessage)
    this.socket.removeEventListener('close', this.handleClose)
    this.socket.removeEventListener('error', this.handleError)
    this.shellServices.close()
    this.rpcPeer.close(event)
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (typeof event.data === 'string') {
      if (this.shellServices.receiveText(event.data)) {
        return
      }
      this.rpcPeer.receive(event.data)
      return
    }
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data)
      if (this.shellServices.receiveBinary(bytes)) {
        return
      }
      this.rpcPeer.receive(event.data)
      return
    }
    this.socket.close(1003, 'Unsupported daemon message')
  }

  private readonly handleClose = (event: CloseEvent): void => {
    this.finishClose(event)
  }

  private readonly handleError = (): void => {
    this.rpcPeer.error()
  }

  private send(payload: string | Uint8Array<ArrayBufferLike>): boolean {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return false
    }
    this.socket.send(typeof payload === 'string' ? payload : copySocketBytes(payload))
    return true
  }
}

class ExtensionRpcSocket extends EventTarget {
  private readonly socket: WebSocket

  constructor(socket: WebSocket) {
    super()
    this.socket = socket
  }

  get readyState(): WebSocket['readyState'] {
    return this.socket.readyState
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>): void {
    this.socket.send(
      typeof data === 'string' || data instanceof Blob ? data : copySocketBytes(data)
    )
  }

  receive(data: string | ArrayBuffer): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  error(): void {
    this.dispatchEvent(new Event('error'))
  }

  close(event?: CloseEvent): void {
    this.dispatchEvent(
      event
        ? new CloseEvent('close', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          })
        : new CloseEvent('close')
    )
  }
}

function copySocketBytes(value: ArrayBufferLike | ArrayBufferView<ArrayBufferLike>): ArrayBuffer {
  const source = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  return copy.buffer
}
