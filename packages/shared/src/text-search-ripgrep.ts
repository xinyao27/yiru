import {
  clampLineContext,
  MAX_MATCHES_PER_FILE,
  normalizeRelativePath,
  pushSearchMatch,
  relativeToSearchRoot,
  SEARCH_MAX_FILE_SIZE
} from './text-search-core'
import type { SearchAccumulator, SearchOptionsLike } from './text-search-core'
import type { SearchFileResult } from './types'

export function splitSearchGlobPatterns(patterns: string): string[] {
  const out: string[] = []
  let current = ''
  let escaping = false
  for (const ch of patterns) {
    if (escaping) {
      current += `\\${ch}`
      escaping = false
      continue
    }
    if (ch === '\\') {
      escaping = true
      continue
    }
    if (ch === ',') {
      const trimmed = current.trim()
      if (trimmed) {
        out.push(trimmed)
      }
      current = ''
      continue
    }
    current += ch
  }
  if (escaping) {
    current += '\\'
  }
  const trimmed = current.trim()
  if (trimmed) {
    out.push(trimmed)
  }
  return out
}

/** Build the complete ripgrep argv shared by local and relay callers. */
export function buildRgArgs(query: string, target: string, opts: SearchOptionsLike): string[] {
  const args: string[] = [
    '--json',
    '--hidden',
    '--glob',
    '!.git',
    '--max-count',
    String(MAX_MATCHES_PER_FILE),
    '--max-filesize',
    `${Math.floor(SEARCH_MAX_FILE_SIZE / 1024 / 1024)}M`
  ]
  if (!opts.caseSensitive) {
    args.push('--ignore-case')
  }
  if (opts.wholeWord) {
    args.push('--word-regexp')
  }
  if (!opts.useRegex) {
    args.push('--fixed-strings')
  }
  if (opts.includePattern) {
    for (const pattern of splitSearchGlobPatterns(opts.includePattern)) {
      args.push('--glob', pattern)
    }
  }
  if (opts.excludePattern) {
    for (const pattern of splitSearchGlobPatterns(opts.excludePattern)) {
      args.push('--glob', `!${pattern}`)
    }
  }
  args.push('--', query, target)
  return args
}

type RipgrepMessage = {
  type?: string
  data?: {
    path?: { text?: string }
    submatches?: { start: number; end: number }[]
    line_number?: number
    lines?: { text?: string }
  }
}

/**
 * Ingest one ripgrep JSON line. Truncation is recorded synchronously before
 * returning `stop`, so callers may safely terminate the child immediately.
 */
export function ingestRgJsonLine(
  line: string,
  rootPath: string,
  acc: SearchAccumulator,
  maxResults: number,
  transformAbsPath?: (path: string) => string
): 'continue' | 'stop' {
  if (acc.totalMatches >= maxResults) {
    return 'stop'
  }
  if (!line) {
    return 'continue'
  }
  let message: RipgrepMessage
  try {
    message = JSON.parse(line)
  } catch {
    return 'continue'
  }
  if (message.type !== 'match' || !message.data) {
    return 'continue'
  }
  const data = message.data
  const rawPath = data.path?.text
  if (typeof rawPath !== 'string') {
    return 'continue'
  }
  const absPath = transformAbsPath ? transformAbsPath(rawPath) : rawPath
  const relativePath = normalizeRelativePath(relativeToSearchRoot(rootPath, absPath))
  const lineContent = (data.lines?.text ?? '').replace(/\n$/, '')
  const lineNumber = data.line_number ?? 0
  const reportedSubmatches = data.submatches ?? []
  const submatches =
    reportedSubmatches.length === 0
      ? [{ start: 0, end: lineContent.length > 0 ? 1 : 0 }]
      : reportedSubmatches

  for (const submatch of submatches) {
    let fileResult: SearchFileResult | undefined = acc.fileMap.get(absPath)
    if (!fileResult) {
      fileResult = { filePath: absPath, relativePath, matches: [], matchCount: 0 }
      acc.fileMap.set(absPath, fileResult)
    }
    const clamped = clampLineContext(lineContent, submatch.start, submatch.end - submatch.start)
    if (pushSearchMatch(fileResult, acc, clamped, lineNumber, maxResults) === 'stop') {
      return 'stop'
    }
  }
  return 'continue'
}
