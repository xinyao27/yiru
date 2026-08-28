import type { IBuffer } from '@xterm/xterm'

import { resolveCursorAgentImeAnchor } from '../pane-manager/terminal-ime-anchor'

export const CURSOR_AGENT_REATTACH_HEADER = 'Cursor Agent'

type TerminalWithFocusMode = {
  textarea?: HTMLTextAreaElement | null
  modes?: { sendFocusMode?: boolean }
}

type TerminalWithInspectableBuffer = {
  cols: number
  rows: number
  buffer?: { active?: IBuffer }
}

export function parsedViewportShowsParkedCursorAgentScreen(
  terminal: TerminalWithInspectableBuffer
): boolean | null {
  const buffer = terminal.buffer?.active
  if (
    !buffer ||
    typeof buffer.getLine !== 'function' ||
    typeof buffer.cursorX !== 'number' ||
    typeof buffer.cursorY !== 'number'
  ) {
    return null
  }
  return (
    resolveCursorAgentImeAnchor({
      buffer,
      rows: terminal.rows,
      cols: terminal.cols,
      cursorX: buffer.cursorX,
      cursorY: buffer.cursorY
    }) !== null
  )
}

export function terminalHasFocusReportingEnabled(terminal: TerminalWithFocusMode): boolean {
  return terminal.modes?.sendFocusMode === true
}

export function terminalOwnsDomFocus(terminal: TerminalWithFocusMode): boolean {
  return (
    typeof document !== 'undefined' &&
    Boolean(terminal.textarea) &&
    document.activeElement === terminal.textarea
  )
}

function stripAnsiCsiSequences(data: string): string {
  let normalized = ''
  let index = 0
  while (index < data.length) {
    if (data.charCodeAt(index) === 0x1b && data[index + 1] === '[') {
      index += 2
      while (index < data.length) {
        const code = data.charCodeAt(index)
        index += 1
        if (code >= 0x40 && code <= 0x7e) {
          break
        }
      }
    } else {
      normalized += data[index]
      index += 1
    }
  }
  return normalized
}

export function hasCursorAgentReattachPayloadScreenSignal(data: string): boolean {
  const normalized = stripAnsiCsiSequences(data)
  // Why: use the last header because replay scrollback may contain an older run.
  const header = CURSOR_AGENT_REATTACH_HEADER
  const headerIndex = normalized.lastIndexOf(header)
  if (headerIndex === -1) {
    return false
  }
  return normalized.slice(headerIndex + header.length, headerIndex + 5000).includes('→ ')
}
