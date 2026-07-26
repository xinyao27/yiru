import { COWORKING_FILE_WRITE_MAX_BYTES } from '../../shared/coworking/operation-contract'
import { CoworkingExecutionError } from './execution-error'

export function decodeCoworkingFileBytes(bytes: Uint8Array<ArrayBufferLike>): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export function decodeCoworkingFileWriteContent(
  content: string,
  encoding: 'utf8' | 'base64'
): Uint8Array {
  if (encoding === 'base64' && !isCanonicalBase64(content)) {
    throw new CoworkingExecutionError('invalid_argument')
  }
  const bytes = Buffer.from(content, encoding)
  if (bytes.byteLength > COWORKING_FILE_WRITE_MAX_BYTES) {
    throw new CoworkingExecutionError('result_too_large')
  }
  return bytes
}

function isCanonicalBase64(value: string): boolean {
  return (
    value === '' || /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
}
