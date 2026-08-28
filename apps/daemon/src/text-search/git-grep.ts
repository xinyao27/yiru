import type { SearchFileResult } from '@yiru/runtime-protocol/workbench/types'

import { clampLineContext, joinSearchRoot, normalizeRelativePath, pushSearchMatch } from './core'
import type { SearchAccumulator, SearchOptionsLike } from './core'
import { escapeRegex } from './regex'
import { splitSearchGlobPatterns } from './ripgrep'

// Why: a bare git pathspec only matches the repository root, while ripgrep
// globs are recursive by default. Git magic preserves the shared behavior.
export function toGitGlobPathspec(glob: string, exclude?: boolean): string {
  const pattern = glob.includes('/') ? glob : `**/${glob}`
  return exclude ? `:(exclude,glob)${pattern}` : `:(glob)${pattern}`
}

export function buildGitGrepArgs(query: string, opts: SearchOptionsLike): string[] {
  const args: string[] = [
    '-c',
    'submodule.recurse=false',
    'grep',
    '-n',
    '-I',
    '--null',
    '--no-color',
    '--untracked',
    '--no-recurse-submodules'
  ]
  if (!opts.caseSensitive) {
    args.push('-i')
  }
  if (opts.wholeWord) {
    args.push('-w')
  }
  args.push(opts.useRegex ? '--extended-regexp' : '--fixed-strings')
  args.push('-e', query, '--')

  let hasPathspecs = false
  if (opts.includePattern) {
    for (const pattern of splitSearchGlobPatterns(opts.includePattern)) {
      args.push(toGitGlobPathspec(pattern))
      hasPathspecs = true
    }
  }
  if (opts.excludePattern) {
    for (const pattern of splitSearchGlobPatterns(opts.excludePattern)) {
      args.push(toGitGlobPathspec(pattern, true))
      hasPathspecs = true
    }
  }
  if (!hasPathspecs) {
    args.push('.')
  }
  return args
}

export function buildSubmatchRegex(
  query: string,
  opts: { useRegex?: boolean; wholeWord?: boolean; caseSensitive?: boolean }
): RegExp | null {
  let pattern = opts.useRegex ? query : escapeRegex(query)
  if (opts.wholeWord) {
    pattern = `\\b${pattern}\\b`
  }
  try {
    return new RegExp(pattern, `g${opts.caseSensitive ? '' : 'i'}`)
  } catch {
    return null
  }
}

function parseGitGrepLine(line: string): {
  relativePath: string
  lineNumber: number
  lineContent: string
} | null {
  const firstNullIndex = line.indexOf('\0')
  if (firstNullIndex === -1) {
    return null
  }
  const relativePath = normalizeRelativePath(line.substring(0, firstNullIndex))
  const rest = line.substring(firstNullIndex + 1)
  const secondNullIndex = rest.indexOf('\0')
  const separatorIndex = secondNullIndex >= 0 ? secondNullIndex : rest.indexOf(':')
  if (separatorIndex === -1) {
    return null
  }
  const lineNumberText = rest.substring(0, separatorIndex)
  if (!/^\d+$/.test(lineNumberText)) {
    return null
  }
  return {
    relativePath,
    lineNumber: Number(lineNumberText),
    lineContent: rest.substring(separatorIndex + 1).replace(/\n$/, '')
  }
}

function getFileResult(
  acc: SearchAccumulator,
  rootPath: string,
  relativePath: string
): SearchFileResult {
  const absolutePath = joinSearchRoot(rootPath, relativePath)
  let fileResult = acc.fileMap.get(absolutePath)
  if (!fileResult) {
    fileResult = { filePath: absolutePath, relativePath, matches: [], matchCount: 0 }
    acc.fileMap.set(absolutePath, fileResult)
  }
  return fileResult
}

export function ingestGitGrepLine(
  line: string,
  rootPath: string,
  submatchRegex: RegExp | null,
  acc: SearchAccumulator,
  maxResults: number
): 'continue' | 'stop' {
  if (acc.totalMatches >= maxResults) {
    return 'stop'
  }
  if (!line) {
    return 'continue'
  }
  const parsed = parseGitGrepLine(line)
  if (!parsed) {
    return 'continue'
  }
  const fileResult = getFileResult(acc, rootPath, parsed.relativePath)

  // Why: git grep may accept regex syntax that JavaScript rejects. Preserve
  // every git-confirmed line with a navigable whole-line fallback.
  if (submatchRegex === null) {
    const clamped = clampLineContext(parsed.lineContent, 0, parsed.lineContent.length)
    return pushSearchMatch(fileResult, acc, clamped, parsed.lineNumber, maxResults)
  }

  submatchRegex.lastIndex = 0
  let match: RegExpExecArray | null
  let acceptedLineMatch = false
  while ((match = submatchRegex.exec(parsed.lineContent)) !== null) {
    acceptedLineMatch = true
    const clamped = clampLineContext(parsed.lineContent, match.index, match[0].length)
    if (pushSearchMatch(fileResult, acc, clamped, parsed.lineNumber, maxResults) === 'stop') {
      return 'stop'
    }
    if (match[0].length === 0) {
      submatchRegex.lastIndex++
    }
  }
  if (!acceptedLineMatch) {
    const clamped = clampLineContext(parsed.lineContent, 0, parsed.lineContent.length)
    if (pushSearchMatch(fileResult, acc, clamped, parsed.lineNumber, maxResults) === 'stop') {
      return 'stop'
    }
  }
  return 'continue'
}
