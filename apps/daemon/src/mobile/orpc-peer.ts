import type { MinimalWebsocket } from '@orpc/server/websocket'
import {
  encodeRuntimeOrpcBinaryFrame,
  encodeRuntimeOrpcTextFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'

export class MobileOrpcPeer {
  private isOpen = true
  private readonly onSendFailure: () => void
  private queue = Promise.resolve()
  private readonly sendBinary: (bytes: Uint8Array) => boolean
  private readonly sendText: (text: string) => boolean
  readonly addEventListener: MinimalWebsocket['addEventListener'] = () => {}
  readonly send: MinimalWebsocket['send'] = (data) => {
    this.queue = this.queue.then(() => this.sendFrame(data)).catch(this.onSendFailure)
  }

  constructor(
    sendText: (text: string) => boolean,
    sendBinary: (bytes: Uint8Array) => boolean,
    onSendFailure: () => void
  ) {
    this.sendText = sendText
    this.sendBinary = sendBinary
    this.onSendFailure = onSendFailure
  }

  close(): void {
    this.isOpen = false
  }

  sendBinaryPayload(payload: Uint8Array<ArrayBufferLike>): boolean {
    if (!this.isOpen) {
      return false
    }
    this.send(Uint8Array.from(payload))
    return true
  }

  private async sendFrame(
    data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
  ): Promise<void> {
    if (!this.isOpen) {
      return
    }
    const didSend =
      typeof data === 'string'
        ? this.sendText(encodeRuntimeOrpcTextFrame(data))
        : this.sendBinary(encodeRuntimeOrpcBinaryFrame(await dataBytes(data)))
    if (!didSend) {
      throw new Error('mobile_socket_not_writable')
    }
  }
}

async function dataBytes(
  data: ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
): Promise<Uint8Array> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  return ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)
}

export function normalizeMobileMessage(message: string | Buffer<ArrayBuffer>): string | Uint8Array {
  return typeof message === 'string' ? message : Uint8Array.from(message)
}

export function copyMobileArrayBuffer(bytes: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}
