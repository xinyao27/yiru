import { JsonRpcErrorCode, RelayErrorCode } from './relay-protocol'

export type SshFileStreamMetadata = {
  streamId?: number
  totalSize: number
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
  chunkEncoding?: 'base64'
  resultEncoding?: 'base64' | 'utf-8'
  empty?: boolean
}

export function isMethodNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  return (err as { code?: unknown }).code === JsonRpcErrorCode.MethodNotFound
}

export class StreamProtocolError extends Error {
  readonly code = RelayErrorCode.StreamProtocolError

  constructor(message: string) {
    super(message)
  }
}

export function parseSshFileStreamMetadata(raw: unknown, maxBytes: number): SshFileStreamMetadata {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('Invalid SSH file stream byte limit')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new StreamProtocolError('Malformed file stream metadata')
  }
  const value = raw as Record<string, unknown>
  if (
    !Number.isInteger(value.totalSize) ||
    (value.totalSize as number) < 0 ||
    typeof value.isBinary !== 'boolean' ||
    (value.empty !== undefined && typeof value.empty !== 'boolean') ||
    (value.isImage !== undefined && typeof value.isImage !== 'boolean') ||
    (value.mimeType !== undefined && typeof value.mimeType !== 'string') ||
    (value.chunkEncoding !== undefined && value.chunkEncoding !== 'base64') ||
    (value.resultEncoding !== undefined &&
      value.resultEncoding !== 'base64' &&
      value.resultEncoding !== 'utf-8')
  ) {
    throw new StreamProtocolError('Invalid file stream metadata fields')
  }
  if ((value.totalSize as number) > maxBytes) {
    throw new StreamProtocolError(
      `Reported totalSize ${value.totalSize as number} exceeds client cap ${maxBytes}`
    )
  }
  const empty = value.empty === true
  const streamId = value.streamId
  if (
    (empty && ((value.totalSize as number) !== 0 || streamId !== undefined)) ||
    (!empty &&
      ((value.totalSize as number) === 0 ||
        !Number.isInteger(streamId) ||
        (streamId as number) <= 0))
  ) {
    throw new StreamProtocolError('Inconsistent file stream metadata')
  }
  return value as SshFileStreamMetadata
}

export function decodeSshStreamBase64(data: string, streamId: number): Buffer {
  if (data.length === 0 || data.length % 4 !== 0) {
    throw new StreamProtocolError(`Malformed base64 chunk for stream ${streamId}`)
  }
  const decoded = Buffer.from(data, 'base64')
  if (decoded.toString('base64') !== data) {
    throw new StreamProtocolError(`Malformed base64 chunk for stream ${streamId}`)
  }
  return decoded
}
