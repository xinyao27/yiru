import { MobileRuntimeOrpcTransport } from './runtime-orpc-transport'
import type { ConnectionState } from './types'

// The primitives the encrypted WebSocket client owns. Kept as plain callbacks so
// the oRPC transport never reaches into the socket's mutable connection state.
export type MobileRuntimeOrpcWiring = {
  waitForConnected: () => Promise<void>
  getState: () => ConnectionState
  nextRequestId: () => string
  // Encrypts and writes an already-framed oRPC payload. Returns false when the
  // socket is not writable, which the channel surfaces as a link failure.
  sendFrame: (payload: string | Uint8Array<ArrayBufferLike>) => boolean
}

export function createMobileRuntimeOrpcTransport(
  wiring: MobileRuntimeOrpcWiring
): MobileRuntimeOrpcTransport {
  return new MobileRuntimeOrpcTransport({
    // The transport already wraps this in `abortable`, so the signal is handled
    // one level up and the socket's own connect-wait needs no deadline here.
    waitForConnected: () => wiring.waitForConnected(),
    getState: wiring.getState,
    nextRequestId: wiring.nextRequestId,
    sendText: (plaintext) => wiring.sendFrame(plaintext),
    sendBinary: (plaintext) => wiring.sendFrame(plaintext)
  })
}
