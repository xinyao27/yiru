import { posix, win32 } from 'node:path'

import { normalizeSearchResult } from './search-match-count'
import type { SearchFileResult, SearchMatch, SearchOptions, SearchResult } from './types'

export type SearchAccumulator = {
  fileMap: Map<string, SearchFileResult>
  totalMatches: number
  truncated: boolean
}

export type SearchOptionsLike = Pick<
  SearchOptions,
  'caseSensitive' | 'wholeWord' | 'useRegex' | 'includePattern' | 'excludePattern'
>

export type ClampedLineContext = {
  lineContent: string
  column: number
  matchLength: number
  displayColumn?: number
  displayMatchLength?: number
}

export const MAX_MATCHES_PER_FILE = 100
export const DEFAULT_SEARCH_MAX_RESULTS = 2000
export const SEARCH_TIMEOUT_MS = 15_000
export const SEARCH_MAX_FILE_SIZE = 5 * 1024 * 1024
export const MAX_LINE_CONTENT_LENGTH = 500

const TRUNCATION_MARKER = '…'

export function createAccumulator(): SearchAccumulator {
  return { fileMap: new Map(), totalMatches: 0, truncated: false }
}

// Why: collapse mixed separators and strip leading slashes so results are
// stable across Windows/Linux and safe to join beneath the search root.
export function normalizeRelativePath(path: string): string {
  return path.replace(/[\\/]+/g, '/').replace(/^\/+/, '')
}

function pathFlavor(rootPath: string): typeof posix | typeof win32 {
  if (/^[a-zA-Z]:[\\/]/.test(rootPath) || rootPath.startsWith('\\\\')) {
    return win32
  }
  return posix
}

export function relativeToSearchRoot(rootPath: string, absPath: string): string {
  return pathFlavor(rootPath).relative(rootPath, absPath)
}

export function joinSearchRoot(rootPath: string, relPath: string): string {
  return pathFlavor(rootPath).join(rootPath, relPath)
}

// Why: line content is transported per match. Capping the window prevents
// minified files from exceeding the relay frame limit while retaining context.
export function clampLineContext(
  text: string,
  matchStart: number,
  matchLength: number
): ClampedLineContext {
  if (text.length <= MAX_LINE_CONTENT_LENGTH) {
    return { lineContent: text, column: matchStart + 1, matchLength }
  }
  const clampedMatchLength = Math.min(matchLength, MAX_LINE_CONTENT_LENGTH)
  const remaining = MAX_LINE_CONTENT_LENGTH - clampedMatchLength
  const leftBudget = Math.floor(remaining / 2)
  let windowStart = Math.max(0, matchStart - leftBudget)
  const windowEnd = Math.min(text.length, windowStart + MAX_LINE_CONTENT_LENGTH)
  windowStart = Math.max(0, windowEnd - MAX_LINE_CONTENT_LENGTH)

  let snippet = text.slice(windowStart, windowEnd)
  let column = matchStart - windowStart + 1
  if (windowStart > 0) {
    snippet = TRUNCATION_MARKER + snippet
    column += TRUNCATION_MARKER.length
  }
  if (windowEnd < text.length) {
    snippet += TRUNCATION_MARKER
  }
  return {
    lineContent: snippet,
    column: matchStart + 1,
    matchLength,
    displayColumn: column,
    displayMatchLength: clampedMatchLength
  }
}

// Why: both backends share one append-and-cap step so truncation is visible
// synchronously before their child process is stopped.
export function pushSearchMatch(
  fileResult: SearchFileResult,
  acc: SearchAccumulator,
  clamped: ClampedLineContext,
  lineNumber: number,
  maxResults: number
): 'continue' | 'stop' {
  const match: SearchMatch = {
    line: lineNumber,
    column: clamped.column,
    matchLength: clamped.matchLength,
    lineContent: clamped.lineContent
  }
  if (clamped.displayColumn !== undefined) {
    match.displayColumn = clamped.displayColumn
  }
  if (clamped.displayMatchLength !== undefined) {
    match.displayMatchLength = clamped.displayMatchLength
  }
  fileResult.matches.push(match)
  fileResult.matchCount = (fileResult.matchCount ?? 0) + 1
  acc.totalMatches++
  if (acc.totalMatches >= maxResults) {
    acc.truncated = true
    return 'stop'
  }
  return 'continue'
}

export function finalize(acc: SearchAccumulator): SearchResult {
  return normalizeSearchResult({
    files: Array.from(acc.fileMap.values()).filter((file) => file.matches.length > 0),
    totalMatches: acc.totalMatches,
    truncated: acc.truncated
  })
}
