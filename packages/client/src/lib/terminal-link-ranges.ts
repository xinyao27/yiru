export type DetectedTerminalLinkRange = {
  startIndex: number
  endIndex: number
  text: string
}

export const LOCAL_PATH_REGEX =
  /(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/]|[A-Za-z0-9._-]+[\\/])[A-Za-z0-9._~\-/%+@\\()[\]]*(?::\d+)?(?::\d+)?/g

const SPACED_PATH_WITH_SEPARATOR_REGEX =
  /(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/]|[A-Za-z0-9._-]+[\\/])[^()[\]{}'",;<>|`\r\n]+(?::\d+)?(?::\d+)?/g
const SPACED_PATH_WITH_EXTENSION_REGEX =
  /(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/]|[A-Za-z0-9._-]+[\\/])[^()[\]{}'",;<>|`\r\n]+(?::\d+)?(?::\d+)?/g
const LINE_ENDING_SPACED_PATH_REGEX =
  /(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/]|[A-Za-z0-9._-]+[\\/])[^()[\]{}'",;<>|`\r\n]+(?::\d+)?(?::\d+)?/g

export const SPACED_LOCAL_PATH_REGEXES = [
  SPACED_PATH_WITH_SEPARATOR_REGEX,
  SPACED_PATH_WITH_EXTENSION_REGEX,
  LINE_ENDING_SPACED_PATH_REGEX
]

export const WORD_TOKEN_REGEX = /[^\s()[\]{}'",;<>|`]+/g

const LEADING_TRIM_CHARS = new Set(['(', '[', '{', '"', "'"])
const TRAILING_TRIM_CHARS = new Set([')', ']', '}', '"', "'", ',', ';', '.'])
const URI_PREFIX_CHAR_PATTERN = /^[A-Za-z0-9+./:-]$/

function trimBoundaryPunctuation(
  value: string,
  startIndex: number
): DetectedTerminalLinkRange | null {
  let start = 0
  let end = value.length
  while (start < end && LEADING_TRIM_CHARS.has(value[start])) {
    start++
  }
  while (end > start && TRAILING_TRIM_CHARS.has(value[end - 1])) {
    end--
  }
  if (start >= end) {
    return null
  }
  return {
    text: value.slice(start, end),
    startIndex: startIndex + start,
    endIndex: startIndex + end
  }
}

export function hasPathSeparator(text: string): boolean {
  return text.includes('/') || text.includes('\\')
}

function hasSeparatorAfterWhitespace(text: string): boolean {
  let sawWhitespace = false
  for (const char of text) {
    if (/\s/.test(char)) {
      sawWhitespace = true
      continue
    }
    if (sawWhitespace && (char === '/' || char === '\\')) {
      return true
    }
  }
  return false
}

function hasInternalWhitespaceBeforeTrimmedEnd(text: string): boolean {
  return /\s/.test(text.trimEnd())
}

function isAtTrimmedLineEnd(lineText: string, endIndex: number): boolean {
  return lineText.slice(endIndex).trim().length === 0
}

function hasSpacedPathExtension(text: string): boolean {
  const range = trimSpacedPathTrailingProse({ text, startIndex: 0, endIndex: text.length })
  const trimmedText = range.text.trimEnd()
  return /\s/.test(trimmedText) && /\.[A-Za-z0-9_+-]+(?::\d+)?(?::\d+)?$/.test(trimmedText)
}

export function* detectTerminalLinkRanges(
  lineText: string,
  regex: RegExp
): Generator<DetectedTerminalLinkRange> {
  for (const match of lineText.matchAll(regex)) {
    const trimmed = trimBoundaryPunctuation(match[0], match.index ?? 0)
    if (trimmed) {
      yield trimmed
    }
  }
}

function getImmediateUriPrefix(lineText: string, endIndex: number): string {
  let start = endIndex
  while (start > 0 && URI_PREFIX_CHAR_PATTERN.test(lineText[start - 1])) {
    start--
  }
  return lineText.slice(start, endIndex)
}

export function isInsideUriScheme(lineText: string, range: DetectedTerminalLinkRange): boolean {
  const prefix = getImmediateUriPrefix(lineText, range.startIndex)
  return (
    range.text.includes('://') ||
    (/[A-Za-z][A-Za-z0-9+.-]*:(?:\/\/)?$/.test(prefix) &&
      (prefix.endsWith('://') || range.text.startsWith('//')))
  )
}

export function mergeTerminalLinkRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length <= 1) {
    return ranges
  }
  const sorted = ranges.slice().sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const merged: [number, number][] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (!last || range[0] > last[1]) {
      merged.push([range[0], range[1]])
      continue
    }
    last[1] = Math.max(last[1], range[1])
  }
  return merged
}

export function terminalLinkRangesOverlap(
  range: DetectedTerminalLinkRange,
  claimedRanges: readonly [number, number][]
): boolean {
  let low = 0
  let high = claimedRanges.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (claimedRanges[mid][0] < range.endIndex) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  const previous = claimedRanges[low - 1]
  return previous !== undefined && previous[1] > range.startIndex
}

export function insertClaimedTerminalLinkRange(
  claimedRanges: [number, number][],
  range: [number, number]
): void {
  const last = claimedRanges.at(-1)
  if (!last || last[0] <= range[0]) {
    claimedRanges.push(range)
    return
  }
  let low = 0
  let high = claimedRanges.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (claimedRanges[mid][0] <= range[0]) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  claimedRanges.splice(low, 0, range)
}

function countPathStarts(text: string): number {
  let count = 0
  for (const match of text.matchAll(/(?:^|\s)(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/])/g)) {
    void match
    count++
  }
  return count
}

export function trimSpacedPathTrailingProse(
  range: DetectedTerminalLinkRange
): DetectedTerminalLinkRange {
  let selected: string | null = null
  const extensionPrefixPattern = /\.[A-Za-z0-9_+-]+(?::\d+)?(?::\d+)?(?=\s+|$)/g
  let match: RegExpExecArray | null
  while ((match = extensionPrefixPattern.exec(range.text)) !== null) {
    const end = match.index + match[0].length
    const text = range.text.slice(0, end)
    if (countPathStarts(text) > 1) {
      continue
    }
    if (
      end < range.text.length ||
      selected === null ||
      /[\\/]/.test(range.text.slice(selected.length, end))
    ) {
      selected = text
    }
  }
  if (!selected) {
    return range
  }
  return {
    text: selected,
    startIndex: range.startIndex,
    endIndex: range.startIndex + selected.length
  }
}

export function trimTerminalLinkTrailingWhitespace(
  range: DetectedTerminalLinkRange
): DetectedTerminalLinkRange {
  const text = range.text.trimEnd()
  return { text, startIndex: range.startIndex, endIndex: range.startIndex + text.length }
}

export function buildLineEndingSpacedPathPrefixRanges(
  range: DetectedTerminalLinkRange
): DetectedTerminalLinkRange[] {
  const ranges: DetectedTerminalLinkRange[] = []
  for (const match of range.text.matchAll(/\s+/g)) {
    const endIndex = match.index ?? 0
    const text = range.text.slice(0, endIndex).trimEnd()
    if (text.includes(' ')) {
      ranges.push({
        text,
        startIndex: range.startIndex,
        endIndex: range.startIndex + text.length
      })
    }
  }
  return ranges.toReversed()
}

export function acceptsSpacedTerminalLinkRange(
  lineText: string,
  range: DetectedTerminalLinkRange,
  regex: RegExp
): boolean {
  if (regex === SPACED_PATH_WITH_SEPARATOR_REGEX && !hasSeparatorAfterWhitespace(range.text)) {
    return false
  }
  if (regex === SPACED_PATH_WITH_EXTENSION_REGEX && !hasSpacedPathExtension(range.text)) {
    return false
  }
  return !(
    regex === LINE_ENDING_SPACED_PATH_REGEX &&
    (!hasInternalWhitespaceBeforeTrimmedEnd(range.text) ||
      !isAtTrimmedLineEnd(lineText, range.endIndex))
  )
}

export function isLineEndingSpacedPathRegex(regex: RegExp): boolean {
  return regex === LINE_ENDING_SPACED_PATH_REGEX
}
