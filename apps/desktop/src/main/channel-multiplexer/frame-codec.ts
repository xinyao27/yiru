// Host-side wire framing for the multiplexer: a 13-byte header matching VS
// Code's PersistentProtocol layout, plus the JSON-RPC payload shapes carried
// inside it. Transport-agnostic — the same frames travel over an SSH exec
// channel and over a WSL child's stdio, so this stays out of both.
// The relay end of the wire keeps its own copy in `src/relay/protocol.ts`
// because that bundle must not depend on Electron main.

export const HEADER_LENGTH = 13
export const MAX_MESSAGE_SIZE = 16 * 1024 * 1024 // 16 MB

/** Message type byte. */
export const MessageType = {
  Regular: 1,
  KeepAlive: 9
} as const

/** Keepalive/timeout (VS Code ProtocolConstants). */
export const KEEPALIVE_SEND_MS = 5_000
export const TIMEOUT_MS = 20_000

// ── JSON-RPC types ──────────────────────────────────────────────────

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type JsonRpcNotification = {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

// ── Framing: encode / decode ────────────────────────────────────────

/**
 * Encode a message into a framed buffer (13-byte header + payload).
 *
 * Header layout:
 * - [0]:    TYPE   (1 byte)
 * - [1-4]:  ID     (uint32 big-endian)
 * - [5-8]:  ACK    (uint32 big-endian)
 * - [9-12]: LENGTH (uint32 big-endian)
 */
export function encodeFrame(
  type: number,
  id: number,
  ack: number,
  payload: Buffer | Uint8Array
): Buffer {
  const header = Buffer.alloc(HEADER_LENGTH)
  header[0] = type
  header.writeUInt32BE(id, 1)
  header.writeUInt32BE(ack, 5)
  header.writeUInt32BE(payload.length, 9)
  return Buffer.concat([header, payload])
}

export function encodeJsonRpcFrame(msg: JsonRpcMessage, id: number, ack: number): Buffer {
  const payload = Buffer.from(JSON.stringify(msg), 'utf-8')
  if (payload.length > MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large: ${payload.length} bytes (max ${MAX_MESSAGE_SIZE})`)
  }
  return encodeFrame(MessageType.Regular, id, ack, payload)
}

export function encodeKeepAliveFrame(id: number, ack: number): Buffer {
  return encodeFrame(MessageType.KeepAlive, id, ack, Buffer.alloc(0))
}

export type DecodedFrame = {
  type: number
  id: number
  ack: number
  payload: Buffer
}

/**
 * Incremental frame parser. Feed it chunks of data; it emits complete frames.
 */
export class FrameDecoder {
  // Why: feed() runs on the Electron main thread for every channel data event.
  // Rebuilding one contiguous buffer per feed (Buffer.concat) re-copies every
  // already-buffered byte for each incoming ~32KB TCP chunk — O(n²) per large
  // frame (a 340KB fs.streamChunk frame cost ~2MB of memcpy). A chunk list
  // assembles each frame exactly once instead.
  private chunks: Buffer[] = []
  private bufferedLength = 0
  private onFrame: (frame: DecodedFrame) => void
  private onError: ((err: Error) => void) | null

  constructor(onFrame: (frame: DecodedFrame) => void, onError?: (err: Error) => void) {
    this.onFrame = onFrame
    this.onError = onError ?? null
  }

  feed(chunk: Buffer | Uint8Array): void {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    if (buf.length > 0) {
      this.chunks.push(buf)
      this.bufferedLength += buf.length
    }

    while (this.bufferedLength >= HEADER_LENGTH) {
      const header = this.peekBytes(HEADER_LENGTH)
      const length = header.readUInt32BE(9)
      const totalLength = HEADER_LENGTH + length

      if (this.bufferedLength < totalLength) {
        // Not fully received yet (also holds oversized frames until they can
        // be skipped whole, keeping the decoder synchronized).
        break
      }

      // Why: throwing here would leave the buffer in a partially consumed
      // state — subsequent feed() calls would try to parse leftover payload
      // bytes as a new header, corrupting every future frame. Instead we
      // skip the entire oversized frame so the decoder stays synchronized.
      if (length > MAX_MESSAGE_SIZE) {
        this.discardBytes(totalLength)
        const err = new Error(`Frame payload too large: ${length} bytes — discarded`)
        if (this.onError) {
          this.onError(err)
        }
        continue
      }

      const framed = this.takeBytes(totalLength)
      const frame: DecodedFrame = {
        type: framed[0],
        id: framed.readUInt32BE(1),
        ack: framed.readUInt32BE(5),
        payload: framed.subarray(HEADER_LENGTH, totalLength)
      }
      this.onFrame(frame)
    }
  }

  reset(): void {
    this.chunks = []
    this.bufferedLength = 0
  }

  /** View of the first `count` buffered bytes without consuming them. */
  private peekBytes(count: number): Buffer {
    const first = this.chunks[0]
    if (first.length >= count) {
      return first
    }
    const out = Buffer.allocUnsafe(count)
    let copied = 0
    for (const part of this.chunks) {
      copied += part.copy(out, copied, 0, Math.min(part.length, count - copied))
      if (copied >= count) {
        break
      }
    }
    return out
  }

  /** Consume and return the first `count` buffered bytes (single copy). */
  private takeBytes(count: number): Buffer {
    const first = this.chunks[0]
    if (first.length === count) {
      this.chunks.shift()
      this.bufferedLength -= count
      return first
    }
    if (first.length > count) {
      this.chunks[0] = first.subarray(count)
      this.bufferedLength -= count
      return first.subarray(0, count)
    }
    const out = Buffer.allocUnsafe(count)
    let copied = 0
    while (copied < count) {
      const part = this.chunks[0]
      const take = Math.min(part.length, count - copied)
      part.copy(out, copied, 0, take)
      copied += take
      if (take === part.length) {
        this.chunks.shift()
      } else {
        this.chunks[0] = part.subarray(take)
      }
    }
    this.bufferedLength -= count
    return out
  }

  /** Consume the first `count` buffered bytes without assembling them. */
  private discardBytes(count: number): void {
    let remaining = count
    while (remaining > 0) {
      const part = this.chunks[0]
      if (part.length <= remaining) {
        this.chunks.shift()
        remaining -= part.length
      } else {
        this.chunks[0] = part.subarray(remaining)
        remaining = 0
      }
    }
    this.bufferedLength -= count
  }
}

/**
 * Parse a JSON-RPC message from a frame payload.
 */
export function parseJsonRpcMessage(payload: Buffer): JsonRpcMessage {
  const text = payload.toString('utf-8')
  const msg = JSON.parse(text) as JsonRpcMessage
  if (msg.jsonrpc !== '2.0') {
    throw new Error(`Invalid JSON-RPC version: ${(msg as Record<string, unknown>).jsonrpc}`)
  }
  return msg
}
