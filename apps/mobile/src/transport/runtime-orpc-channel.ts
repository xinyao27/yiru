import {
  decodeRuntimeOrpcBinaryFrame,
  decodeRuntimeOrpcTextFrame,
  encodeRuntimeOrpcBinaryFrame,
  encodeRuntimeOrpcTextFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'

type PortEvent = 'message' | 'close'
type PortListener = (event?: { data: unknown }) => void

export class MobileRuntimeOrpcChannel {
  private readonly listeners = new Map<PortEvent, Set<PortListener>>()
  private isClosed = false
  private readonly sendText: (plaintext: string) => boolean
  private readonly sendBinary: (plaintext: Uint8Array<ArrayBufferLike>) => boolean

  constructor(options: {
    sendText: (plaintext: string) => boolean
    sendBinary: (plaintext: Uint8Array<ArrayBufferLike>) => boolean
  }) {
    this.sendText = options.sendText
    this.sendBinary = options.sendBinary
  }

  on(event: string, listener: PortListener): void {
    if (event !== 'message' && event !== 'close') {
      return
    }
    let listeners = this.listeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(event, listeners)
    }
    listeners.add(listener)
  }

  postMessage(message: unknown): void {
    if (this.isClosed) {
      // Why: RPCLink can emit cancellation frames after its port close event.
      // A closed MessagePort drops those frames; throwing here creates an
      // unrelated unhandled rejection after the original call already failed.
      return
    }
    const sent =
      typeof message === 'string'
        ? this.sendText(encodeRuntimeOrpcTextFrame(message))
        : this.sendBinary(encodeRuntimeOrpcBinaryFrame(messageBytes(message)))
    if (!sent) {
      // Why: closing the port rejects every in-flight RPC through RPCLink's
      // normal delivery path and avoids orphaned cancellation-frame errors.
      this.close()
    }
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
    const payload = decodeRuntimeOrpcBinaryFrame(frame)
    if (payload === null) {
      return false
    }
    this.emitMessage(payload)
    return true
  }

  close(): void {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    for (const listener of this.listeners.get('close') ?? []) {
      listener()
    }
    this.listeners.clear()
  }

  private emitMessage(data: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data })
    }
  }
}

function messageBytes(message: unknown): Uint8Array<ArrayBufferLike> {
  if (message instanceof Uint8Array) {
    return message
  }
  if (message instanceof ArrayBuffer) {
    return new Uint8Array(message)
  }
  throw new Error('The encrypted mobile oRPC channel received an unsupported peer message')
}
