import {
  WEB_CONNECT_MAX_RELAY_FRAME_BYTES,
  WEB_CONNECT_PROTOCOL_VERSION
} from '@yiru/runtime-protocol/web-connect'
import {
  RelayOpaqueFrameSchema,
  WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES,
  type RelayOpaqueFrame
} from '@yiru/runtime-protocol/web-connect/relay-frames'

import { base64UrlToBytes, bytesToBase64Url } from './encoding'

export function relayMessageByteLength(message: string | ArrayBuffer): number {
  return typeof message === 'string'
    ? new TextEncoder().encode(message).byteLength
    : message.byteLength
}

export function encodeRelayFrame(
  connectionId: string,
  message: string | ArrayBuffer
): RelayOpaqueFrame {
  return {
    type: 'relay-frame',
    version: WEB_CONNECT_PROTOCOL_VERSION,
    connectionId,
    encoding: typeof message === 'string' ? 'text' : 'base64url',
    payload: typeof message === 'string' ? message : bytesToBase64Url(new Uint8Array(message))
  }
}

export function decodeRelayFrame(raw: string): {
  connectionId: string
  message: string | ArrayBuffer
} | null {
  if (new TextEncoder().encode(raw).byteLength > WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = RelayOpaqueFrameSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }
  const message =
    parsed.data.encoding === 'text'
      ? parsed.data.payload
      : Uint8Array.from(base64UrlToBytes(parsed.data.payload)).buffer
  return relayMessageByteLength(message) <= WEB_CONNECT_MAX_RELAY_FRAME_BYTES
    ? { connectionId: parsed.data.connectionId, message }
    : null
}

export function sendRelayFrame(socket: WebSocket, message: string | ArrayBuffer): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(message)
  }
}
