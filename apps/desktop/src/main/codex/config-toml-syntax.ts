import {
  createTomlLineScanState,
  isTomlStructuralLine,
  updateTomlLineScanState
} from './config-toml-line-scan'

export type ParsedTomlString = { value: string; endIndex: number }

export function escapeTomlString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\b', '\\b')
    .replaceAll('\f', '\\f')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}

export function parseTomlSingleLineString(
  line: string,
  startIndex: number
): ParsedTomlString | null {
  if (line[startIndex] === '"') {
    return parseBasicString(line, startIndex + 1)
  }
  if (line[startIndex] === "'") {
    return parseLiteralString(line, startIndex + 1)
  }
  return null
}

export function skipTomlInlineWhitespace(line: string, startIndex: number): number {
  let index = startIndex
  while (line[index] === ' ' || line[index] === '\t') {
    index += 1
  }
  return index
}

export function findNextTableHeader(text: string): number {
  let cursor = 0
  let scanState = createTomlLineScanState()
  while (cursor < text.length) {
    const newlineIndex = text.indexOf('\n', cursor)
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex
    const line = text.slice(cursor, lineEnd).replace(/\r$/, '')
    if (isTomlStructuralLine(scanState)) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('[') && isCompleteTableHeader(trimmed)) {
        return cursor
      }
    }
    scanState = updateTomlLineScanState(scanState, line)
    if (newlineIndex === -1) {
      return -1
    }
    cursor = newlineIndex + 1
  }
  return -1
}

export function unescapeTomlString(escaped: string): string {
  let result = ''
  let index = 0
  while (index < escaped.length) {
    const char = escaped[index]
    if (char === '\\' && index + 1 < escaped.length) {
      result += unescapeBasicStringEscape(escaped[index + 1])
      index += 2
    } else {
      result += char
      index += 1
    }
  }
  return result
}

function parseBasicString(line: string, startIndex: number): ParsedTomlString | null {
  let value = ''
  let index = startIndex
  while (index < line.length) {
    const char = line[index]
    if (char === '"') {
      return { value, endIndex: index + 1 }
    }
    if (char === '\\' && index + 1 < line.length) {
      value += unescapeBasicStringEscape(line[index + 1])
      index += 2
      continue
    }
    value += char
    index += 1
  }
  return null
}

function parseLiteralString(line: string, startIndex: number): ParsedTomlString | null {
  const endIndex = line.indexOf("'", startIndex)
  return endIndex === -1
    ? null
    : { value: line.slice(startIndex, endIndex), endIndex: endIndex + 1 }
}

function isCompleteTableHeader(line: string): boolean {
  if (!line.startsWith('[')) {
    return false
  }
  const isArrayHeader = line.startsWith('[[')
  let index = isArrayHeader ? 2 : 1
  let inBasicQuote = false
  let inLiteralQuote = false
  while (index < line.length) {
    const char = line[index]
    if (inBasicQuote) {
      if (char === '\\' && index + 1 < line.length) {
        index += 2
        continue
      }
      if (char === '"') {
        inBasicQuote = false
      }
      index += 1
      continue
    }
    if (inLiteralQuote) {
      if (char === "'") {
        inLiteralQuote = false
      }
      index += 1
      continue
    }
    if (char === '"') {
      inBasicQuote = true
    } else if (char === "'") {
      inLiteralQuote = true
    } else if (char === ']') {
      if (isArrayHeader && line[index + 1] !== ']') {
        return false
      }
      const tail = line.slice(index + (isArrayHeader ? 2 : 1))
      return /^\s*(#.*)?$/.test(tail)
    }
    index += 1
  }
  return false
}

function unescapeBasicStringEscape(next: string): string {
  if (next === 'n') {
    return '\n'
  }
  if (next === 'r') {
    return '\r'
  }
  if (next === 't') {
    return '\t'
  }
  if (next === 'b') {
    return '\b'
  }
  if (next === 'f') {
    return '\f'
  }
  if (next === '"') {
    return '"'
  }
  if (next === '\\') {
    return '\\'
  }
  // Why: preserve unknown escapes rather than silently dropping bytes.
  return `\\${next}`
}
