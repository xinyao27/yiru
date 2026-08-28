import { MAX_TAIL_PENDING_ANSI_CHARS } from './runtime-limits'
import { hasCanonicalNumericCsiParams, parseAnsiControlSequence } from './terminal-control-parser'

export function normalizeTerminalChunk(
  chunk: string,
  pendingAnsi: string = ''
): { text: string; pendingAnsi: string } {
  // Why: most high-throughput PTY chunks are plain printable text. Avoid
  // running every ANSI/OSC regex over megabytes that do not need normalization.
  if (pendingAnsi.length === 0 && !terminalChunkNeedsNormalization(chunk)) {
    return { text: chunk, pendingAnsi: '' }
  }
  const combined = `${pendingAnsi}${chunk}`
  const parts: string[] = []
  let textStart = 0
  for (let index = 0; index < combined.length; index += 1) {
    const char = combined[index]
    if (char === '\x1b') {
      appendTerminalNormalizedSpan(parts, combined, textStart, index)
      if (index + 1 >= combined.length) {
        return { text: parts.join(''), pendingAnsi: combined.slice(index) }
      }
      const parsed = parseAnsiControlSequence(combined, index)
      if (!parsed) {
        return {
          text: parts.join(''),
          pendingAnsi: trimPendingAnsiControl(combined.slice(index))
        }
      }
      if (parsed.kind === 'csi' && isTerminalPreviewLineControl(parsed)) {
        // Why: Codex can redraw status text with ANSI controls but no CR; keep
        // those controls so the tail buffer overwrites the previous frame.
        parts.push(combined.slice(index, parsed.endIndex + 1))
      }
      index = parsed.endIndex
      textStart = index + 1
      continue
    }
    if (char === '\r' && combined[index + 1] === '\n') {
      appendTerminalNormalizedSpan(parts, combined, textStart, index)
      parts.push('\n')
      index += 1
      textStart = index + 1
      continue
    }
    const code = combined.charCodeAt(index)
    if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0d) {
      appendTerminalNormalizedSpan(parts, combined, textStart, index)
      parts.push(char)
      textStart = index + 1
    } else if (!isTerminalPreviewPrintableCodeUnit(code)) {
      appendTerminalNormalizedSpan(parts, combined, textStart, index)
      textStart = index + 1
    }
  }
  appendTerminalNormalizedSpan(parts, combined, textStart, combined.length)
  return { text: parts.join(''), pendingAnsi: '' }
}

export function appendTerminalNormalizedSpan(
  parts: string[],
  value: string,
  start: number,
  end: number
): void {
  if (end > start) {
    parts.push(value.slice(start, end))
  }
}

export function isTerminalPreviewPrintableCodeUnit(code: number): boolean {
  return code >= 0x20 && code !== 0x7f && (code < 0x80 || code > 0x9f)
}

export function terminalChunkNeedsNormalization(chunk: string): boolean {
  for (let index = 0; index < chunk.length; index++) {
    const code = chunk.charCodeAt(index)
    if (
      code === 0x1b ||
      code === 0x7f ||
      code === 0x0d ||
      code < 0x09 ||
      (code > 0x0a && code < 0x20) ||
      (code >= 0x80 && code <= 0x9f)
    ) {
      return true
    }
  }
  return false
}

export function trimPendingAnsiControl(value: string): string {
  if (value.length <= MAX_TAIL_PENDING_ANSI_CHARS) {
    return value
  }
  const introducer = value.slice(0, Math.min(2, value.length))
  const suffixBudget = Math.max(0, MAX_TAIL_PENDING_ANSI_CHARS - introducer.length)
  return `${introducer}${value.slice(-suffixBudget)}`
}

export function normalizeRuntimeWorktreeInstanceId(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length <= 512 && !trimmed.includes('\0') ? trimmed : null
}

export function isTerminalPreviewLineControl(parsed: {
  final: string
  params: string
  firstParam: number | null
}): boolean {
  if (!hasCanonicalNumericCsiParams(parsed.params)) {
    return false
  }
  if (parsed.final === 'K') {
    const mode = parsed.firstParam ?? 0
    return mode === 0 || mode === 1 || mode === 2
  }
  return (
    parsed.final === 'A' ||
    parsed.final === 'G' ||
    parsed.final === '`' ||
    parsed.final === 'D' ||
    parsed.final === 'C'
  )
}

export function maxTimestamp(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right
  }
  if (right === null) {
    return left
  }
  return Math.max(left, right)
}
