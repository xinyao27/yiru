import type { LspTextEdit } from './language-server-protocol'

export function applyLanguageServerTextEdits(content: string, edits: LspTextEdit[]): string {
  const normalized = edits.map((edit) => {
    if (!edit || typeof edit.newText !== 'string') {
      throw new Error('The language server returned an invalid text edit.')
    }
    const start = positionToOffset(content, edit.range.start.line, edit.range.start.character)
    const end = positionToOffset(content, edit.range.end.line, edit.range.end.character)
    if (end < start) {
      throw new Error('The language server returned a reversed text range.')
    }
    return { start, end, text: edit.newText }
  })
  normalized.sort((left, right) => left.start - right.start || left.end - right.end)
  for (let index = 1; index < normalized.length; index++) {
    const previous = normalized[index - 1]
    const current = normalized[index]
    if (current.start < previous.end || current.start === previous.start) {
      throw new Error('The language server returned overlapping text edits.')
    }
  }
  let result = content
  for (const edit of normalized.toReversed()) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
  }
  return result
}

function positionToOffset(content: string, line: number, character: number): number {
  if (!Number.isInteger(line) || !Number.isInteger(character) || line < 0 || character < 0) {
    throw new Error('The language server returned an invalid text position.')
  }
  let lineStart = 0
  for (let currentLine = 0; currentLine < line; currentLine++) {
    const newline = content.indexOf('\n', lineStart)
    if (newline === -1) {
      throw new Error('The language server edit is outside the document.')
    }
    lineStart = newline + 1
  }
  const newline = content.indexOf('\n', lineStart)
  const rawLineEnd = newline === -1 ? content.length : newline
  const lineEnd =
    rawLineEnd > lineStart && content[rawLineEnd - 1] === '\r' ? rawLineEnd - 1 : rawLineEnd
  if (lineStart + character > lineEnd) {
    throw new Error('The language server edit is outside the document.')
  }
  return lineStart + character
}
