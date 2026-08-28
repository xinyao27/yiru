import type { TerminalChunkScanFlags } from '@yiru/runtime-protocol/workbench/terminal/chunk-scan-flags'

export function classifyTerminalChunk(data: string): TerminalChunkScanFlags {
  let hasBel = false
  let hasEsc = false
  let hasOscIntroducer = false
  let previousWasEsc = false
  for (let index = 0; index < data.length; index += 1) {
    const code = data.charCodeAt(index)
    if (code === 0x07) {
      hasBel = true
    }
    if (previousWasEsc && code === 0x5d) {
      hasOscIntroducer = true
    }
    previousWasEsc = code === 0x1b
    hasEsc ||= previousWasEsc
    if (hasBel && hasEsc && hasOscIntroducer) {
      break
    }
  }
  return { hasBel, hasEsc, hasOscIntroducer }
}
