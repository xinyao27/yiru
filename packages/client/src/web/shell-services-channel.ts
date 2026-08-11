import { RPCHandler, type MinimalWebsocket } from '@orpc/server/websocket'
import {
  decodeShellServicesOrpcBinaryFrame,
  decodeShellServicesOrpcTextFrame,
  encodeShellServicesOrpcBinaryFrame,
  encodeShellServicesOrpcConnectFrame,
  encodeShellServicesOrpcTextFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'
import { createShellServicesRouter } from '~renderer/runtime/shell-services-handler'

type SendText = (plaintext: string) => boolean
type SendBinary = (plaintext: Uint8Array<ArrayBufferLike>) => boolean

export class WebShellServicesChannel {
  private readonly handler = new RPCHandler(createShellServicesRouter())
  private readonly peer: WebShellServicesPeer
  private isClosed = false

  constructor(sendText: SendText, sendBinary: SendBinary, onFailure: () => void) {
    this.peer = new WebShellServicesPeer(sendText, sendBinary, onFailure)
  }

  connect(): boolean {
    return this.peer.sendConnect()
  }

  receiveText(frame: string): boolean {
    const payload = decodeShellServicesOrpcTextFrame(frame)
    if (payload === null) {
      return false
    }
    void this.handler.message(this.peer, payload).catch(() => this.peer.fail())
    return true
  }

  receiveBinary(frame: Uint8Array<ArrayBufferLike>): boolean {
    const payload = decodeShellServicesOrpcBinaryFrame(frame)
    if (payload === null) {
      return false
    }
    void this.handler.message(this.peer, arrayBufferOf(payload)).catch(() => this.peer.fail())
    return true
  }

  close(): void {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    this.handler.close(this.peer)
    this.peer.close()
  }
}

class WebShellServicesPeer {
  private sendQueue = Promise.resolve()
  private isClosed = false

  readonly addEventListener: MinimalWebsocket['addEventListener'] = () => {}
  readonly send: MinimalWebsocket['send'] = (data) => {
    this.sendQueue = this.sendQueue.then(() => this.sendFrame(data)).catch(() => this.fail())
  }

  constructor(
    private readonly sendText: SendText,
    private readonly sendBinary: SendBinary,
    private readonly onFailure: () => void
  ) {}

  sendConnect(): boolean {
    return !this.isClosed && this.sendText(encodeShellServicesOrpcConnectFrame())
  }

  fail(): void {
    if (!this.isClosed) {
      this.onFailure()
    }
  }

  close(): void {
    this.isClosed = true
    this.sendQueue = Promise.resolve()
  }

  private async sendFrame(
    data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
  ): Promise<void> {
    if (this.isClosed) {
      throw new Error('Shell services peer is closed')
    }
    const sent =
      typeof data === 'string'
        ? this.sendText(encodeShellServicesOrpcTextFrame(data))
        : this.sendBinary(encodeShellServicesOrpcBinaryFrame(await websocketDataBytes(data)))
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
