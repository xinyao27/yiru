import { encodeTerminalStreamText } from '../../../shared/terminal/stream-protocol'
import { terminalStreamByteLength } from './terminal-stream-byte-length'

export type TerminalOutputMeta = {
  seq?: number
  rawLength?: number
  cwd?: string
}

export type TerminalOutputFrameChunk = {
  bytes: Uint8Array<ArrayBufferLike>
  seq?: number
}

export const TERMINAL_STREAM_CHUNK_BYTES = 48 * 1024
const TERMINAL_STREAM_BYTE_PROBE_CODE_UNITS = 8 * 1024
const MAX_UTF8_BYTES_PER_CODE_UNIT = 3

export function exceedsTerminalStreamChunkBytes(data: string): boolean {
  if (data.length > TERMINAL_STREAM_CHUNK_BYTES) {
    return true
  }
  if (data.length * MAX_UTF8_BYTES_PER_CODE_UNIT <= TERMINAL_STREAM_CHUNK_BYTES) {
    return false
  }
  let byteLength = 0
  for (let start = 0; start < data.length; ) {
    let end = Math.min(start + TERMINAL_STREAM_BYTE_PROBE_CODE_UNITS, data.length)
    const high = data.charCodeAt(end - 1)
    const low = data.charCodeAt(end)
    if (end < data.length && high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) {
      end -= 1
    }
    byteLength += terminalStreamByteLength(data.slice(start, end))
    if (byteLength > TERMINAL_STREAM_CHUNK_BYTES) {
      return true
    }
    start = end
  }
  return false
}

export function* iterateTerminalOutputFrameChunks(
  data: string,
  meta?: TerminalOutputMeta
): Generator<TerminalOutputFrameChunk> {
  if (!exceedsTerminalStreamChunkBytes(data)) {
    yield { bytes: encodeTerminalStreamText(data), seq: meta?.seq }
    return
  }

  const rawLength = meta?.rawLength ?? data.length
  const sourceSeq = meta?.seq
  const canPreserveChunkSeq = typeof sourceSeq === 'number' && rawLength === data.length
  const shouldDelayFinalSeq = !canPreserveChunkSeq && typeof sourceSeq === 'number'
  const startSeq = canPreserveChunkSeq ? sourceSeq - rawLength : undefined
  let chunkStart = 0
  let chunkBytes = 0
  let delayedChunk: { text: string; seq?: number } | null = null

  const takeChunk = (end: number): { text: string; seq?: number } => {
    const text = data.slice(chunkStart, end)
    const current = {
      text,
      seq: startSeq === undefined ? undefined : startSeq + chunkStart + text.length
    }
    chunkStart = end
    chunkBytes = 0
    return current
  }

  let index = 0
  while (index < data.length) {
    const code = data.charCodeAt(index)
    let width = 1
    let partBytes = 3
    if (code < 0x80) {
      partBytes = 1
    } else if (code < 0x800) {
      partBytes = 2
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      (data.charCodeAt(index + 1) & 0xfc00) === 0xdc00
    ) {
      partBytes = 4
      width = 2
    }
    if (chunkBytes > 0 && chunkBytes + partBytes > TERMINAL_STREAM_CHUNK_BYTES) {
      const nextChunk = takeChunk(index)
      if (shouldDelayFinalSeq) {
        if (delayedChunk) {
          yield { bytes: encodeTerminalStreamText(delayedChunk.text) }
        }
        delayedChunk = nextChunk
      } else {
        yield { bytes: encodeTerminalStreamText(nextChunk.text), seq: nextChunk.seq }
      }
    }
    chunkBytes += partBytes
    index += width
  }

  const finalChunk = takeChunk(data.length)
  if (shouldDelayFinalSeq) {
    if (delayedChunk) {
      yield { bytes: encodeTerminalStreamText(delayedChunk.text) }
    }
    yield { bytes: encodeTerminalStreamText(finalChunk.text), seq: sourceSeq }
    return
  }
  yield { bytes: encodeTerminalStreamText(finalChunk.text), seq: finalChunk.seq }
}
