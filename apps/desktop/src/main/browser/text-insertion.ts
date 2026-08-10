import { measureClipboardTextByteLength } from '@yiru/workbench-model/ui'

export const BROWSER_TEXT_INSERT_CHUNK_BYTES = 64 * 1024

function getUtf8ByteLengthForCodePoint(codePoint: number): number {
  if (codePoint <= 0x7f) {
    return 1
  }
  if (codePoint <= 0x7ff) {
    return 2
  }
  if (codePoint <= 0xffff) {
    return 3
  }
  return 4
}

export function* iterateBrowserTextInsertionChunks(
  text: string,
  maxChunkBytes = BROWSER_TEXT_INSERT_CHUNK_BYTES
): Generator<string> {
  if (text.length === 0) {
    return
  }
  const normalizedMax = Number.isFinite(maxChunkBytes) && maxChunkBytes > 0 ? maxChunkBytes : 1
  const measurement = measureClipboardTextByteLength(text, { stopAfterBytes: normalizedMax })
  if (!measurement.exceededLimit) {
    yield text
    return
  }

  let currentStart = 0
  let currentBytes = 0
  let index = 0
  while (index < text.length) {
    const codePoint = text.codePointAt(index) ?? 0
    const codeUnitLength = codePoint > 0xffff ? 2 : 1
    const nextIndex = index + codeUnitLength
    const characterBytes = getUtf8ByteLengthForCodePoint(codePoint)
    if (currentBytes > 0 && currentBytes + characterBytes > normalizedMax) {
      yield text.slice(currentStart, index)
      currentStart = index
      currentBytes = 0
    }
    currentBytes += characterBytes
    index = nextIndex
  }
  if (currentStart < text.length) {
    yield text.slice(currentStart)
  }
}
