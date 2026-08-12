import type { WebSocket } from 'ws'
import { parseRuntimeLoopbackTarget, type RuntimeLoopbackTarget } from '~shared/runtime-loopback'

export function parseTargetFrame(frame: string): RuntimeLoopbackTarget | null {
  try {
    return parseRuntimeLoopbackTarget(JSON.parse(frame))
  } catch {
    return null
  }
}

export function rawDataBytes(data: WebSocket.RawData): Uint8Array<ArrayBufferLike> {
  if (Array.isArray(data)) {
    return Buffer.concat(data)
  }
  return new Uint8Array(data as Buffer)
}

export function sendWebSocket(
  ws: WebSocket,
  payload: string | Uint8Array<ArrayBufferLike>
): boolean {
  if (ws.readyState !== ws.OPEN) {
    return false
  }
  ws.send(payload)
  return true
}
