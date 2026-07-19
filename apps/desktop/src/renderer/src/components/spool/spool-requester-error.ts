import {
  isSpoolRequesterTransportErrorCode,
  type SpoolRequesterTransportErrorCode
} from '../../../../shared/spool/spool-ipc-contract'

const ELECTRON_INVOKE_ERROR_PATTERN =
  /^(?:Error:\s*)?(?:Error invoking remote method '[^']+':\s*)?(?:Error:\s*)*([a-z_]+)$/

/** Projects only declared transport codes from Electron's wrapped IPC errors. */
export function getSpoolRequesterTransportErrorCode(
  error: unknown
): SpoolRequesterTransportErrorCode | null {
  const directCode = readStringProperty(error, 'code')
  if (directCode && isSpoolRequesterTransportErrorCode(directCode)) {
    return directCode
  }
  const message = typeof error === 'string' ? error : readStringProperty(error, 'message')
  if (!message) {
    return null
  }
  const match = ELECTRON_INVOKE_ERROR_PATTERN.exec(message.trim())
  const projected = match?.[1] ?? ''
  return isSpoolRequesterTransportErrorCode(projected) ? projected : null
}

function readStringProperty(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || !(key in value)) {
    return null
  }
  const candidate = Reflect.get(value, key)
  return typeof candidate === 'string' ? candidate : null
}
