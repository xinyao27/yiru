import type { PairingOffer } from '@yiru/runtime-protocol/workbench/pairing'

import {
  deriveSharedKey,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from '../e2ee-crypto'
import { RemoteRuntimeClientError } from './client'
import { invalidRemoteRuntimeResponseError, remoteRuntimeUnavailableError } from './request-frames'
import { createRemoteRuntimeSocket, remoteRuntimeSocketBytes } from './socket'

export type RemoteRuntimeWebSocket = {
  ws: WebSocket
  sharedKey: Uint8Array
  cleanup: () => void
}

export type RemoteRuntimeWebSocketCallbacks = {
  onClose: (ws: WebSocket, code: number, reason: string) => void
  onError: (ws: WebSocket, error: RemoteRuntimeClientError) => void
  onTextFrame: (ws: WebSocket, frame: string) => void
  onBinaryFrame?: (ws: WebSocket, frame: Uint8Array<ArrayBufferLike>) => void
  // Why: protocol-level pongs (and server heartbeat pings) are the liveness
  // signal for detecting half-open tunnels that never deliver `close` (#7718).
  onPong?: (ws: WebSocket) => void
  onPing?: (ws: WebSocket) => void
}

export function openRemoteRuntimeWebSocket(
  pairing: PairingOffer,
  callbacks: RemoteRuntimeWebSocketCallbacks
): { ok: true; socket: RemoteRuntimeWebSocket } | { ok: false; error: RemoteRuntimeClientError } {
  const opened = createSocket(pairing)
  if (!opened.ok) {
    return opened
  }
  const { ws, keyPair } = opened
  const serverPublicKey = publicKeyFromBase64(pairing.publicKeyB64)
  const sharedKey = deriveSharedKey(keyPair.secretKey, serverPublicKey)

  let cleanedUp = false
  const onOpen = (): void => {
    ws.send(
      JSON.stringify({
        type: 'e2ee_hello',
        publicKeyB64: publicKeyToBase64(keyPair.publicKey)
      })
    )
  }
  const onError = (): void => {
    callbacks.onError(ws, remoteRuntimeUnavailableError('Could not connect to the runtime host.'))
  }
  const onClose = (event: CloseEvent): void => callbacks.onClose(ws, event.code, event.reason)
  const onMessage = (event: MessageEvent<unknown>): void => {
    if (typeof event.data === 'string') {
      callbacks.onTextFrame(ws, event.data)
      return
    }
    const bytes = remoteRuntimeSocketBytes(event.data)
    if (bytes && callbacks.onBinaryFrame) {
      callbacks.onBinaryFrame(ws, bytes)
      return
    }
    callbacks.onError(
      ws,
      invalidRemoteRuntimeResponseError('Runtime host returned an unexpected binary frame.')
    )
  }
  const onPong = (): void => callbacks.onPong?.(ws)
  const onPing = (): void => callbacks.onPing?.(ws)
  const cleanup = (): void => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    ws.removeEventListener('open', onOpen)
    ws.removeEventListener('error', onError)
    ws.removeEventListener('close', onClose)
    ws.removeEventListener('message', onMessage)
    ws.removeEventListener('pong', onPong)
    ws.removeEventListener('ping', onPing)
  }

  ws.addEventListener('open', onOpen, { once: true })
  ws.addEventListener('error', onError)
  ws.addEventListener('close', onClose)
  ws.addEventListener('message', onMessage)
  ws.addEventListener('pong', onPong)
  ws.addEventListener('ping', onPing)
  return { ok: true, socket: { ws, sharedKey, cleanup } }
}

function createSocket(
  pairing: PairingOffer
):
  | { ok: true; ws: WebSocket; keyPair: ReturnType<typeof generateKeyPair> }
  | { ok: false; error: RemoteRuntimeClientError } {
  let keyPair: ReturnType<typeof generateKeyPair>
  try {
    keyPair = generateKeyPair()
    publicKeyFromBase64(pairing.publicKeyB64)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: new RemoteRuntimeClientError(
        'invalid_argument',
        `Invalid remote pairing key: ${message}`
      )
    }
  }
  try {
    return { ok: true, ws: createRemoteRuntimeSocket(pairing.endpoint), keyPair }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: new RemoteRuntimeClientError('invalid_argument', `Invalid remote endpoint: ${message}`)
    }
  }
}
