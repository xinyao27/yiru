export type TerminalMultiplexPendingOutput = {
  payload: Uint8Array
  startSeq: bigint
  endSeq: bigint
}

export function splitTerminalMultiplexOutput(
  payload: Uint8Array,
  startSeq: bigint,
  endSeq: bigint,
  targetBytes: number
): TerminalMultiplexPendingOutput[] {
  const chunks: TerminalMultiplexPendingOutput[] = []
  let offset = 0
  while (offset < payload.byteLength) {
    let nextOffset = Math.min(payload.byteLength, offset + targetBytes)
    while (
      nextOffset < payload.byteLength &&
      nextOffset > offset &&
      (payload[nextOffset]! & 0xc0) === 0x80
    ) {
      nextOffset -= 1
    }
    if (nextOffset === offset) {
      nextOffset = Math.min(payload.byteLength, offset + targetBytes)
    }
    chunks.push({
      payload: payload.slice(offset, nextOffset),
      startSeq: startSeq + BigInt(offset),
      endSeq: nextOffset === payload.byteLength ? endSeq : startSeq + BigInt(nextOffset)
    })
    offset = nextOffset
  }
  return chunks
}
