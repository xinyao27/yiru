import {
  WEB_CONNECT_MAX_RELAY_FRAME_BYTES,
  WEB_CONNECT_PROTOCOL_VERSION
} from '@yiru/runtime-protocol/web-connect'
import {
  RelayConnectionCloseSchema,
  RelayOpaqueFrameSchema,
  type RelayConnectionClose,
  type RelayOpaqueFrame
} from '@yiru/runtime-protocol/web-connect/relay-frames'

export function encodeRelayFrame(
  connectionId: string,
  data: Buffer,
  isBinary: boolean
): RelayOpaqueFrame | null {
  const payload = isBinary ? data.toString('base64url') : data.toString('utf8')
  const decodedBytes = isBinary ? data.byteLength : Buffer.byteLength(payload)
  if (decodedBytes > WEB_CONNECT_MAX_RELAY_FRAME_BYTES) {
    return null
  }
  return {
    type: 'relay-frame',
    version: WEB_CONNECT_PROTOCOL_VERSION,
    connectionId,
    encoding: isBinary ? 'base64url' : 'text',
    payload
  }
}

export function decodeRelayFrame(raw: string): {
  connectionId: string
  data: string | Buffer
  isBinary: boolean
} | null {
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
  const isBinary = parsed.data.encoding === 'base64url'
  const data = isBinary ? Buffer.from(parsed.data.payload, 'base64url') : parsed.data.payload
  const byteLength = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength
  return byteLength <= WEB_CONNECT_MAX_RELAY_FRAME_BYTES
    ? { connectionId: parsed.data.connectionId, data, isBinary }
    : null
}

export function parseConnectionClose(raw: string): RelayConnectionClose | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = RelayConnectionCloseSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function connectionCloseFrame(connectionId: string): RelayConnectionClose {
  return {
    type: 'relay-connection-close',
    version: WEB_CONNECT_PROTOCOL_VERSION,
    connectionId
  }
}
