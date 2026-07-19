import { TextDecoder } from 'node:util'

import {
  SPOOL_SESSION_INVENTORY_JSONL_LINE_MAX_BYTES,
  SPOOL_SESSION_INVENTORY_STREAM_PROFILE,
  SPOOL_SESSION_INVENTORY_TRANSCRIPT_MAX_BYTES
} from '../../shared/spool/spool-resource-limits'
import type { FileReadResult } from '../providers/types'
import type { SshChannelMultiplexer } from './ssh-channel-multiplexer'
import {
  consumeSshFileStream,
  StreamProtocolError,
  type SshFileStreamMetadata
} from './ssh-filesystem-stream-consumer'

export { isMethodNotFoundError, StreamProtocolError } from './ssh-filesystem-stream-consumer'

const MAX_PREVIEWABLE_BINARY_SIZE = 50 * 1024 * 1024
const MAX_TEXT_FILE_SIZE = 10 * 1024 * 1024

export async function readFileViaStream(
  mux: SshChannelMultiplexer,
  filePath: string,
  signal?: AbortSignal
): Promise<FileReadResult> {
  let buffer: Buffer | null = null
  let offset = 0
  const metadata = await consumeSshFileStream(mux, filePath, {
    maxBytes: MAX_PREVIEWABLE_BINARY_SIZE,
    signal,
    onMetadata: (value) => {
      const cap = value.isBinary ? MAX_PREVIEWABLE_BINARY_SIZE : MAX_TEXT_FILE_SIZE
      if (value.totalSize > cap) {
        throw new StreamProtocolError(
          `Reported totalSize ${value.totalSize} exceeds client cap ${cap}`
        )
      }
      if (!value.empty) {
        try {
          buffer = Buffer.alloc(value.totalSize)
        } catch (error) {
          throw new Error(
            `Failed to allocate ${value.totalSize} bytes: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    },
    onChunk: (chunk) => {
      if (!buffer) {
        throw new StreamProtocolError('File stream emitted content without an output buffer')
      }
      chunk.copy(buffer, offset)
      offset += chunk.length
    }
  })

  return fileReadResult(metadata, buffer)
}

export async function consumeSessionInventoryJsonLines(
  mux: SshChannelMultiplexer,
  filePath: string,
  consumeLine: (line: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const decoder = new BoundedUtf8LineDecoder(
    SPOOL_SESSION_INVENTORY_JSONL_LINE_MAX_BYTES,
    consumeLine
  )
  await consumeSshFileStream(mux, filePath, {
    maxBytes: SPOOL_SESSION_INVENTORY_TRANSCRIPT_MAX_BYTES,
    profile: SPOOL_SESSION_INVENTORY_STREAM_PROFILE,
    signal,
    onMetadata: (metadata) => {
      if (metadata.isBinary || metadata.isImage || metadata.resultEncoding === 'base64') {
        throw new StreamProtocolError('Session inventory transcript is not UTF-8 text')
      }
    },
    onChunk: (chunk) => decoder.consume(chunk)
  })
  signal?.throwIfAborted()
  decoder.finish()
  signal?.throwIfAborted()
}

function fileReadResult(metadata: SshFileStreamMetadata, buffer: Buffer | null): FileReadResult {
  if (metadata.empty) {
    return {
      content: '',
      isBinary: metadata.isBinary,
      ...(metadata.isImage !== undefined ? { isImage: metadata.isImage } : {}),
      ...(metadata.mimeType !== undefined ? { mimeType: metadata.mimeType } : {})
    }
  }
  if (!buffer) {
    throw new StreamProtocolError('File stream completed without content')
  }
  return {
    content:
      metadata.resultEncoding === 'utf-8' ? buffer.toString('utf-8') : buffer.toString('base64'),
    isBinary: metadata.isBinary,
    ...(metadata.isImage !== undefined ? { isImage: metadata.isImage } : {}),
    ...(metadata.mimeType !== undefined ? { mimeType: metadata.mimeType } : {})
  }
}

class BoundedUtf8LineDecoder {
  private decoder = new TextDecoder('utf-8', { fatal: true })
  private decodedSegments: string[] = []
  private pendingBytes = 0

  constructor(
    private readonly maxLineBytes: number,
    private readonly consumeLine: (line: string) => void
  ) {}

  consume(chunk: Buffer): void {
    let segmentStart = 0
    for (let index = 0; index < chunk.length; index++) {
      if (chunk[index] !== 0x0a) {
        continue
      }
      this.append(chunk.subarray(segmentStart, index))
      this.emitLine()
      segmentStart = index + 1
    }
    this.append(chunk.subarray(segmentStart))
  }

  finish(): void {
    if (this.pendingBytes === 0) {
      return
    }
    this.emitLine()
  }

  private append(bytes: Buffer): void {
    if (bytes.length === 0) {
      return
    }
    this.pendingBytes += bytes.length
    if (this.pendingBytes > this.maxLineBytes) {
      throw new StreamProtocolError(
        `Session inventory JSONL record exceeds ${this.maxLineBytes} bytes`
      )
    }
    try {
      const decoded = this.decoder.decode(bytes, { stream: true })
      if (decoded) {
        this.decodedSegments.push(decoded)
      }
    } catch {
      throw new StreamProtocolError('Session inventory transcript contains invalid UTF-8')
    }
  }

  private emitLine(): void {
    try {
      const tail = this.decoder.decode()
      if (tail) {
        this.decodedSegments.push(tail)
      }
    } catch {
      throw new StreamProtocolError('Session inventory transcript contains invalid UTF-8')
    }
    let line = this.decodedSegments.join('')
    if (line.endsWith('\r')) {
      line = line.slice(0, -1)
    }
    this.consumeLine(line)
    this.decodedSegments = []
    this.pendingBytes = 0
  }
}
