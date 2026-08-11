// Degraded conversation source for panes with no on-disk transcript and no live
// agent-hook session id. We have nothing structured to work with — only the raw
// terminal scrollback — so we strip ANSI and best-effort segment it into coarse
// user/assistant turns. This is intentionally approximate: no per-agent TUI
// parsing happens here, and every produced message is marked `source:'scrape'`
// so the assembler ranks it below transcript/hook copies of the same turn. See
// docs/plans/2026-06-17-001-feat-native-chat-view-plan.md (U6).

// Why: replicate (not import) the minimal ANSI/control-sequence strip used by
// agent-session-fork-context.ts so we don't modify that file. Same three
// patterns: CSI sequences, OSC sequences, and stray single-char escapes.
const ESC = String.fromCharCode(27)
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g')
const OSC_SEQUENCE_PATTERN = new RegExp(`${ESC}\\][^\\u0007]*(?:\\u0007|${ESC}\\\\)`, 'g')
const SINGLE_ESCAPE_PATTERN = new RegExp(`${ESC}(?:[@-Z\\\\-_]|[()*+\\-./][0-~]|c)`, 'g')

function stripUnsupportedControlCharacters(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    // Drop C0 control chars except tab (9) and newline (10); keep DEL (127) out.
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      continue
    }
    result += char
  }
  return result
}

/** Strip ANSI/OSC escapes and normalize newlines so raw scrollback reads as plain text. */
export function stripScrollbackAnsi(value: string): string {
  return stripUnsupportedControlCharacters(
    value
      .replace(OSC_SEQUENCE_PATTERN, '')
      .replace(ANSI_ESCAPE_PATTERN, '')
      .replace(SINGLE_ESCAPE_PATTERN, '')
  )
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}
