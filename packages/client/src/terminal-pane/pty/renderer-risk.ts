import {
  terminalOutputPrefersRenderRefresh,
  terminalRewriteOutputRenderRefreshDecision
} from '../pane-manager/terminal-complex-script'
import {
  containsCursorPositionSequence,
  SYNCHRONIZED_OUTPUT_END_SEQUENCE,
  SYNCHRONIZED_OUTPUT_MARKER_TAIL_CHARS,
  SYNCHRONIZED_OUTPUT_START_SEQUENCE,
  TERMINAL_RENDERER_RISK_SCAN_TAIL_CHARS
} from './terminal-output-policy'

type RendererRiskOptions = {
  getPtyId: () => string | null
}

export type RendererRisk = {
  foregroundOutputPrefersRefresh: (data: string) => boolean
  hiddenOutputNeedsAtlasRecovery: (data: string) => boolean
  resetHidden: (ptyId?: string | null) => void
  resetSkippedHidden: () => void
}

export function containsNonAsciiOutput(data: string): boolean {
  for (let index = 0; index < data.length; index += 1) {
    if (data.charCodeAt(index) > 0x7f) {
      return true
    }
  }
  return false
}

export function createRendererRisk(options: RendererRiskOptions): RendererRisk {
  let foregroundScanTail = ''
  let hiddenPtyId: string | null = null
  let isHiddenSynchronizedOutputActive = false
  let hiddenSynchronizedOutputTail = ''
  let didHiddenRewriteEndWithCarriageReturn = false
  let hiddenRewriteCsiTail = ''

  const trailingIncompleteCsiSequence = (data: string): string => {
    const escapeIndex = data.lastIndexOf('\x1b')
    if (escapeIndex === -1) {
      return ''
    }
    const tail = data.slice(escapeIndex)
    if (tail === '\x1b') {
      return tail
    }
    if (!tail.startsWith('\x1b[')) {
      return ''
    }
    for (let index = 2; index < tail.length; index += 1) {
      const code = tail.charCodeAt(index)
      if (code >= 0x40 && code <= 0x7e) {
        return ''
      }
    }
    return tail.slice(-TERMINAL_RENDERER_RISK_SCAN_TAIL_CHARS)
  }

  const resetHidden = (ptyId: string | null = null): void => {
    hiddenPtyId = ptyId
    isHiddenSynchronizedOutputActive = false
    hiddenSynchronizedOutputTail = ''
    didHiddenRewriteEndWithCarriageReturn = false
    hiddenRewriteCsiTail = ''
  }

  const hiddenSynchronizedOutputTouchesParsedFrame = (data: string): boolean => {
    const scanData = hiddenSynchronizedOutputTail ? `${hiddenSynchronizedOutputTail}${data}` : data
    const currentChunkStartIndex = scanData.length - data.length
    let isActive = isHiddenSynchronizedOutputActive
    let touchesParsedFrame = isActive && data.length > 0
    let offset = 0

    while (offset < scanData.length) {
      const startIndex = scanData.indexOf(SYNCHRONIZED_OUTPUT_START_SEQUENCE, offset)
      const endIndex = scanData.indexOf(SYNCHRONIZED_OUTPUT_END_SEQUENCE, offset)
      if (startIndex === -1 && endIndex === -1) {
        break
      }
      if (endIndex !== -1 && (startIndex === -1 || endIndex < startIndex)) {
        if (
          isActive &&
          endIndex + SYNCHRONIZED_OUTPUT_END_SEQUENCE.length > currentChunkStartIndex
        ) {
          touchesParsedFrame = true
        }
        isActive = false
        offset = endIndex + SYNCHRONIZED_OUTPUT_END_SEQUENCE.length
      } else if (startIndex !== -1) {
        isActive = true
        if (startIndex + SYNCHRONIZED_OUTPUT_START_SEQUENCE.length > currentChunkStartIndex) {
          touchesParsedFrame = true
        }
        offset = startIndex + SYNCHRONIZED_OUTPUT_START_SEQUENCE.length
      }
    }

    if (isActive && data.length > 0) {
      touchesParsedFrame = true
    }
    isHiddenSynchronizedOutputActive = isActive
    hiddenSynchronizedOutputTail = scanData.slice(-SYNCHRONIZED_OUTPUT_MARKER_TAIL_CHARS)
    return touchesParsedFrame
  }

  const hiddenTuiRedrawPrefersAtlasRecovery = (data: string): boolean => {
    const scanData = hiddenRewriteCsiTail ? `${hiddenRewriteCsiTail}${data}` : data
    const decision = terminalRewriteOutputRenderRefreshDecision(data, {
      previousChunkEndsWithCarriageReturn: didHiddenRewriteEndWithCarriageReturn,
      previousRewriteCsiScanTail: hiddenRewriteCsiTail
    })
    didHiddenRewriteEndWithCarriageReturn = decision.nextChunkEndsWithCarriageReturn
    hiddenRewriteCsiTail = decision.nextRewriteCsiScanTail
    return decision.prefersRenderRefresh || containsCursorPositionSequence(scanData)
  }

  return {
    foregroundOutputPrefersRefresh: (data) => {
      if (!data) {
        return false
      }
      const scanData = foregroundScanTail ? `${foregroundScanTail}${data}` : data
      const prefersRefresh =
        (scanData.includes('\x1b[') || containsNonAsciiOutput(scanData)) &&
        terminalOutputPrefersRenderRefresh(scanData)
      foregroundScanTail = trailingIncompleteCsiSequence(scanData)
      return prefersRefresh
    },
    hiddenOutputNeedsAtlasRecovery: (data) => {
      if (!data) {
        return false
      }
      const ptyId = options.getPtyId()
      if (hiddenPtyId !== ptyId) {
        resetHidden(ptyId)
      }
      return (
        hiddenSynchronizedOutputTouchesParsedFrame(data) ||
        hiddenTuiRedrawPrefersAtlasRecovery(data)
      )
    },
    resetHidden,
    resetSkippedHidden: () => {
      // Why: skipped bytes were not parsed by xterm. Reset a live frame so a
      // dropped DEC start cannot make later plain output look risky.
      resetHidden(options.getPtyId())
    }
  }
}
