import { decodeRuntimeOrpcSideChannelBinaryFrame } from '@yiru/runtime-protocol/orpc-peer-frame'

export type RuntimeOrpcBinaryListener = (frame: Uint8Array<ArrayBufferLike>) => void

export class RuntimeOrpcBinarySideChannel {
  private readonly listeners = new Map<string, RuntimeOrpcBinaryListener>()
  private readonly port: MessagePort

  constructor(port: MessagePort) {
    this.port = port
    port.addEventListener('message', this.handleMessage)
  }

  register(requestId: string, listener: RuntimeOrpcBinaryListener | undefined): () => void {
    if (!listener) {
      return () => {}
    }
    this.listeners.set(requestId, listener)
    return () => {
      if (this.listeners.get(requestId) === listener) {
        this.listeners.delete(requestId)
      }
    }
  }

  close(): void {
    this.port.removeEventListener('message', this.handleMessage)
    this.listeners.clear()
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    const bytes = messageBytes(event.data)
    const frame = bytes ? decodeRuntimeOrpcSideChannelBinaryFrame(bytes) : null
    if (!frame) {
      return
    }
    // Why: side-channel frames share the MessagePort with the oRPC peer but are
    // consumed here, before the peer decoder sees their private envelope.
    event.stopImmediatePropagation()
    this.listeners.get(frame.requestId)?.(frame.payload)
  }
}

export function retainRuntimeOrpcBinaryRoute(output: unknown, release: () => void): unknown {
  if (!isAsyncIterator(output)) {
    release()
    return output
  }
  return retainIterator(output, release)
}

async function* retainIterator(
  iterator: AsyncIterator<unknown, unknown, void> & AsyncIterable<unknown>,
  release: () => void
): AsyncGenerator<unknown, unknown, void> {
  let completed = false
  try {
    while (true) {
      const next = await iterator.next()
      if (next.done) {
        completed = true
        return next.value
      }
      yield next.value
    }
  } finally {
    if (!completed) {
      await iterator.return?.()
    }
    release()
  }
}

function isAsyncIterator(
  value: unknown
): value is AsyncIterator<unknown, unknown, void> & AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'next' in value &&
    typeof value.next === 'function' &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}

function messageBytes(value: unknown): Uint8Array<ArrayBufferLike> | null {
  if (value instanceof Uint8Array) {
    return value
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}
