/* eslint-disable no-control-regex -- Why: terminal path extraction must bound matches around raw ANSI control bytes in PTY output. */

import {
  RECENT_PTY_OUTPUT_LIMIT,
  RECENT_PTY_PATH_CANDIDATE_LIMIT,
  RECENT_PTY_PATH_CANDIDATE_MAX_BYTES,
  RECENT_PTY_PATH_CANDIDATE_TOTAL_BYTES
} from './terminal-startup'

export function appendRecentPtyOutput(previous: string | undefined, data: string): string {
  if (data.length >= RECENT_PTY_OUTPUT_LIMIT) {
    return data.slice(-RECENT_PTY_OUTPUT_LIMIT)
  }
  return `${previous ?? ''}${data}`.slice(-RECENT_PTY_OUTPUT_LIMIT)
}

export function appendRecentPtyPathCandidates(
  previous: string[] | undefined,
  data: string
): string[] {
  const extractedCandidates = extractTerminalOutputPathCandidates(data)
  if (extractedCandidates.length === 0) {
    // Why: pathless output is the common hot path. Reuse immutable history so
    // each PTY chunk does not clone and byte-scan up to 1,024 old candidates.
    return previous ?? []
  }
  const next = previous ? previous.slice() : []
  for (const candidate of extractedCandidates) {
    if (Buffer.byteLength(candidate, 'utf8') > RECENT_PTY_PATH_CANDIDATE_MAX_BYTES) {
      continue
    }
    next.push(candidate)
  }
  return pruneRecentPtyPathCandidates(next)
}

export function recentTerminalPathCandidatesIncludePath(
  recentCandidates: readonly string[],
  pathText: string,
  absolutePath: string
): boolean {
  const candidates = new Set(
    [
      pathText,
      absolutePath,
      ...wslTerminalOutputAliases(pathText),
      ...wslTerminalOutputAliases(absolutePath)
    ]
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0)
  )
  for (const recent of recentCandidates) {
    if (candidates.has(recent)) {
      return true
    }
  }
  return false
}

export function pruneRecentPtyPathCandidates(candidates: string[]): string[] {
  const countBounded =
    candidates.length > RECENT_PTY_PATH_CANDIDATE_LIMIT
      ? candidates.slice(-RECENT_PTY_PATH_CANDIDATE_LIMIT)
      : candidates
  let totalBytes = 0
  let startIndex = countBounded.length
  for (let index = countBounded.length - 1; index >= 0; index -= 1) {
    const nextTotal = totalBytes + Buffer.byteLength(countBounded[index]!, 'utf8')
    if (nextTotal > RECENT_PTY_PATH_CANDIDATE_TOTAL_BYTES) {
      break
    }
    totalBytes = nextTotal
    startIndex = index
  }
  return startIndex === 0 ? countBounded : countBounded.slice(startIndex)
}

export function recentTerminalOutputIncludesPath(
  recentOutput: string,
  pathText: string,
  absolutePath: string
): boolean {
  const candidates = new Set(
    [pathText, absolutePath]
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0)
  )
  if (candidates.size === 0) {
    return false
  }
  for (const candidate of candidates) {
    if (outputContainsPathCandidate(recentOutput, candidate)) {
      return true
    }
  }
  const decodedOutput = decodeTerminalOutputPercentEscapes(recentOutput)
  if (decodedOutput !== recentOutput) {
    for (const candidate of candidates) {
      if (outputContainsPathCandidate(decodedOutput, candidate)) {
        return true
      }
    }
  }
  return false
}

export function outputContainsPathCandidate(output: string, candidate: string): boolean {
  let start = output.indexOf(candidate)
  while (start !== -1) {
    const end = start + candidate.length
    if (isPathCandidateStartBoundary(output, start) && isPathCandidateEndBoundary(output, end)) {
      return true
    }
    start = output.indexOf(candidate, start + 1)
  }
  return false
}

export function isPathCandidateStartBoundary(output: string, start: number): boolean {
  if (start === 0) {
    return true
  }
  if (output.slice(0, start).endsWith('file://')) {
    return true
  }
  if (
    /^[A-Za-z]:[\\/]/.test(output.slice(start)) &&
    /file:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)?\/$/i.test(output.slice(0, start))
  ) {
    return true
  }
  if (/file:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(output.slice(0, start))) {
    return true
  }
  return !isPathCandidateContinuationChar(output[start - 1]!)
}

export function isPathCandidateEndBoundary(output: string, end: number): boolean {
  const next = output[end]
  if (!next) {
    return true
  }
  if (next === ':' && /^\d+(?::\d+)?(?:\D|$)/.test(output.slice(end + 1))) {
    return true
  }
  return !isPathCandidateContinuationChar(next)
}

export function isPathCandidateContinuationChar(char: string): boolean {
  return /[A-Za-z0-9._~/%+@\\()[\]-]/.test(char)
}

export function decodeTerminalOutputPercentEscapes(value: string): string {
  return value.replace(/(?:%[0-9a-f]{2})+/gi, (match) => {
    try {
      return decodeURIComponent(match)
    } catch {
      return match
    }
  })
}

// Why: extraction runs on the PTY hot path for every chunk, and the extension
// regex backtracks quadratically on pathological separator runs. No candidate
// can cross a newline (the regex classes exclude \r\n), so scan per line and
// skip lines already too long to yield a storable candidate —
// appendRecentPtyPathCandidates drops oversized candidates anyway, and the raw
// recent-output buffer still covers provenance inside oversized lines.
export function extractTerminalOutputPathCandidates(data: string): string[] {
  const candidates: string[] = []
  const add = (value: string): void => {
    const candidate = trimTerminalOutputPathCandidate(value)
    if (candidate.length > 0) {
      candidates.push(candidate)
      const drivePath = normalizeTerminalOutputFileUriDrivePath(candidate)
      if (drivePath) {
        candidates.push(drivePath)
      }
    }
  }
  for (const line of data.split(/[\r\n]+/)) {
    if (line.length === 0 || line.length > RECENT_PTY_PATH_CANDIDATE_MAX_BYTES) {
      continue
    }
    collectTerminalOutputLinePathCandidates(line, add)
  }
  return candidates
}

export function collectTerminalOutputLinePathCandidates(
  line: string,
  add: (value: string) => void
): void {
  for (const match of line.matchAll(/file:\/\/([^/\s]*)(\/[^\s\x1b"'<>)]*)/gi)) {
    const authority = match[1] ?? ''
    const uriPath = match[2]
    if (uriPath) {
      const decoded = decodeTerminalOutputPercentEscapes(uriPath)
      add(isTerminalOutputLoopbackAuthority(authority) ? decoded : `//${authority}${decoded}`)
    }
  }
  for (const match of line.matchAll(
    /(?:\/(?:tmp|private\/tmp)\/|[A-Za-z]:[\\/])[^\r\n\x1b"'<>]+/g
  )) {
    if (isInsideNonLocalFileUri(line, match.index)) {
      continue
    }
    add(match[0])
  }
  for (const match of line.matchAll(
    /\/[^\r\n\x1b"'<>]*\.[A-Za-z0-9_+-]+(?:[#:\s][^\r\n\x1b"'<>]*)?/g
  )) {
    if (isInsideNonLocalFileUri(line, match.index)) {
      continue
    }
    add(match[0])
  }
}

export function normalizeTerminalOutputFileUriDrivePath(candidate: string): string | null {
  return /^\/[A-Za-z]:[\\/]/.test(candidate) ? candidate.slice(1) : null
}

export function trimTerminalOutputPathCandidate(value: string): string {
  let candidate = value.trim().replace(/[),;.]+$/g, '')
  if (Buffer.byteLength(candidate, 'utf8') > RECENT_PTY_PATH_CANDIDATE_MAX_BYTES) {
    return ''
  }
  let selected: string | null = null
  for (const match of candidate.matchAll(
    /.+?\.[A-Za-z0-9_+-]+(?:#L\d+(?:C\d+)?|(?::\d+)?(?::\d+)?)?(?=\s+|$)/gi
  )) {
    const end = match.index + match[0].length
    const text = candidate.slice(0, end)
    if (countTerminalOutputPathStarts(text) > 1) {
      continue
    }
    // Same rule as the tap parsers: a line-end extension token only extends
    // the candidate when the added segment is path-like, so trailing prose
    // ending in a filename is not swallowed into the candidate.
    if (
      end < candidate.length ||
      selected === null ||
      /[\\/]/.test(candidate.slice(selected.length, end))
    ) {
      selected = text
    }
  }
  return trimTerminalOutputPathLocator(selected ?? candidate)
}

export function isTerminalOutputLoopbackAuthority(authority: string): boolean {
  const normalized = authority.toLowerCase()
  return (
    normalized === '' ||
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  )
}

export function isInsideNonLocalFileUri(output: string, pathStart: number): boolean {
  const prefix = output.slice(0, pathStart)
  const match = /file:\/\/([^/\s]*)$/i.exec(prefix)
  return !!match && !isTerminalOutputLoopbackAuthority(match[1] ?? '')
}

export function countTerminalOutputPathStarts(value: string): number {
  let count = 0
  for (const match of value.matchAll(/(?:^|\s)(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/])/g)) {
    void match
    count += 1
  }
  return count
}

export function trimTerminalOutputPathLocator(value: string): string {
  return value.replace(/#L\d+(?:C\d+)?$/i, '').replace(/:\d+(?::\d+)?$/, '')
}

export function wslTerminalOutputAliases(value: string): string[] {
  const match = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)$/i.exec(value)
  if (!match) {
    return []
  }
  const linuxPath = match[1]!.replace(/\\/g, '/')
  return linuxPath.startsWith('/') ? [linuxPath] : [`/${linuxPath}`]
}
