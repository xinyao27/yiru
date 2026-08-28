import { isDocumentVisibilityProvenStale } from '../stale-document-visibility'

export const TERMINAL_RENDERER_RISK_SCAN_TAIL_CHARS = 256
export const SYNCHRONIZED_OUTPUT_START_SEQUENCE = '\x1b[?2026h'
export const SYNCHRONIZED_OUTPUT_END_SEQUENCE = '\x1b[?2026l'
export const SYNCHRONIZED_OUTPUT_MARKER_TAIL_CHARS = SYNCHRONIZED_OUTPUT_START_SEQUENCE.length - 1
export const CURSOR_SHOW_SEQUENCE = '\x1b[?25h'
const CURSOR_HIDE_SEQUENCE = '\x1b[?25l'
export const TERMINAL_FOCUS_IN_SEQUENCE = '\x1b[I'
export const TERMINAL_FOCUS_OUT_SEQUENCE = '\x1b[O'
export const FOCUS_REPORTING_DISABLE_SEQUENCE = '\x1b[?1004l'
export const FOREGROUND_THROUGHPUT_IMMEDIATE_CHARS = 2048
export const FOREGROUND_INTERACTIVE_REDRAW_CHARS = 128 * 1024
export const FOREGROUND_INTERACTIVE_REDRAW_WINDOW_MS = 150
export const FOREGROUND_SYNCHRONIZED_FRAME_INTERACTIVE_WINDOW_MS = 400
export const FOREGROUND_IMMEDIATE_BUDGET_CHARS = 128 * 1024
export const FOREGROUND_BUDGET_WINDOW_MS = 500
export const FOREGROUND_GRID_DRIFT_CHECK_MIN_MS = 250

const INACTIVE_FOREGROUND_IMMEDIATE_BUDGET_CHARS = 32 * 1024
let inactiveBudgetChars = 0
let inactiveBudgetWindowStart = 0

export function consumeInactiveForegroundImmediateBudget(dataLength: number): boolean {
  const now = performance.now()
  if (now - inactiveBudgetWindowStart > FOREGROUND_BUDGET_WINDOW_MS) {
    inactiveBudgetChars = 0
    inactiveBudgetWindowStart = now
  }
  if (inactiveBudgetChars + dataLength > INACTIVE_FOREGROUND_IMMEDIATE_BUDGET_CHARS) {
    return false
  }
  inactiveBudgetChars += dataLength
  return true
}

export function shouldWritePtyOutputForeground(isPaneVisible: boolean): boolean {
  if (!isPaneVisible) {
    return false
  }
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    return true
  }
  // Why: user input can prove macOS's occlusion visibility flag stale.
  return isDocumentVisibilityProvenStale()
}

export function containsSynchronizedOutputStart(data: string): boolean {
  return data.includes(SYNCHRONIZED_OUTPUT_START_SEQUENCE)
}

export function containsSynchronizedOutputEnd(data: string): boolean {
  return data.includes(SYNCHRONIZED_OUTPUT_END_SEQUENCE)
}

export function shouldSynchronizedOutputRemainActive(data: string, wasActive: boolean): boolean {
  const lastStartIndex = data.lastIndexOf(SYNCHRONIZED_OUTPUT_START_SEQUENCE)
  const lastEndIndex = data.lastIndexOf(SYNCHRONIZED_OUTPUT_END_SEQUENCE)
  return lastStartIndex === -1 && lastEndIndex === -1 ? wasActive : lastStartIndex > lastEndIndex
}

export function containsCursorPositionSequence(data: string): boolean {
  let offset = data.indexOf('\x1b[')
  while (offset !== -1) {
    let index = offset + 2
    while (index < data.length) {
      const char = data[index]
      if (char === 'G' || char === 'H' || char === 'f') {
        return true
      }
      if ((char < '0' || char > '9') && char !== ';') {
        break
      }
      index += 1
    }
    offset = data.indexOf('\x1b[', offset + 2)
  }
  return false
}

export function containsCursorRestore(data: string): boolean {
  const hideIndex = data.indexOf(CURSOR_HIDE_SEQUENCE)
  const showIndex = data.lastIndexOf(CURSOR_SHOW_SEQUENCE)
  return hideIndex !== -1 && showIndex > hideIndex && containsCursorPositionSequence(data)
}
