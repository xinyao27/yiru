import { measureClipboardTextByteLength } from '@yiru/workbench-model/ui'

export type TerminalStreamByteLengthMeasurement = {
  byteLength: number
  exceededLimit: boolean
}

const MAX_UTF8_BYTES_PER_CODE_UNIT = 3
const MIN_NATIVE_BYTE_LENGTH_CODE_UNITS = 16

export function terminalStreamByteLength(data: string): number {
  if (data.length < MIN_NATIVE_BYTE_LENGTH_CODE_UNITS) {
    return measureClipboardTextByteLength(data).byteLength
  }
  return Buffer.byteLength(data, 'utf8')
}

export function terminalStreamByteLengthExceeds(data: string, maxBytes: number): boolean {
  if (data.length === 0 || !Number.isFinite(maxBytes)) {
    return false
  }
  if (data.length > maxBytes) {
    return true
  }
  if (data.length < MIN_NATIVE_BYTE_LENGTH_CODE_UNITS) {
    return measureClipboardTextByteLength(data, { stopAfterBytes: maxBytes }).exceededLimit
  }
  return Buffer.byteLength(data, 'utf8') > maxBytes
}

export function measureTerminalStreamByteLength(
  data: string,
  options: { stopAfterBytes?: number } = {}
): TerminalStreamByteLengthMeasurement {
  const stopAfterBytes = options.stopAfterBytes
  if (typeof stopAfterBytes !== 'number' || !Number.isFinite(stopAfterBytes)) {
    return { byteLength: terminalStreamByteLength(data), exceededLimit: false }
  }
  // Why: callers retain the scanner's truncated total after crossing a cap, so
  // native counting is safe only when the upper bound proves it cannot cross.
  if (
    data.length >= MIN_NATIVE_BYTE_LENGTH_CODE_UNITS &&
    data.length * MAX_UTF8_BYTES_PER_CODE_UNIT <= stopAfterBytes
  ) {
    return { byteLength: Buffer.byteLength(data, 'utf8'), exceededLimit: false }
  }
  return measureClipboardTextByteLength(data, options)
}
