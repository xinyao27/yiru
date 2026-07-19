import { SPOOL_FILE_WRITE_MAX_BYTES } from '../../shared/spool/spool-operation-contract'
import { SpoolExecutionError } from './spool-execution-error'

export function decodeSpoolFileBytes(bytes: Uint8Array<ArrayBufferLike>): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export function decodeSpoolFileWriteContent(
  content: string,
  encoding: 'utf8' | 'base64'
): Uint8Array {
  if (encoding === 'base64' && !isCanonicalBase64(content)) {
    throw new SpoolExecutionError('invalid_argument')
  }
  const bytes = Buffer.from(content, encoding)
  if (bytes.byteLength > SPOOL_FILE_WRITE_MAX_BYTES) {
    throw new SpoolExecutionError('result_too_large')
  }
  return bytes
}

function isCanonicalBase64(value: string): boolean {
  return (
    value === '' || /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
}
