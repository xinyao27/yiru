// File-path detection for a single tap in the terminal. Mirrors the desktop
// link detection (packages/client/src/lib/terminal-links.ts) but only finds the
// one path span containing the tapped column — mobile opens a tapped path, it
// does not render hover links over the whole line.

export type TappedFilePath = {
  pathText: string
  line: number | null
  column: number | null
}

export function parsePathWithOptionalLineColumn(value: string): TappedFilePath | null {
  const match = /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(value)
  if (!match) {
    return null
  }
  const pathText = match[1]
  // Reject a directory-only token (trailing separator) for either slash style.
  if (!pathText || pathText.endsWith('/') || pathText.endsWith('\\')) {
    return null
  }
  const line = match[2] ? Number.parseInt(match[2], 10) : null
  const column = match[3] ? Number.parseInt(match[3], 10) : null
  if ((line !== null && line < 1) || (column !== null && column < 1)) {
    return null
  }
  return { pathText, line, column }
}
