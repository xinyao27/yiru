import { parseExplicitFileLinkTarget } from './explicit-file-link-target'
import {
  acceptsSpacedTerminalLinkRange,
  buildLineEndingSpacedPathPrefixRanges,
  detectTerminalLinkRanges,
  hasPathSeparator,
  insertClaimedTerminalLinkRange,
  isInsideUriScheme,
  isLineEndingSpacedPathRegex,
  LOCAL_PATH_REGEX,
  mergeTerminalLinkRanges,
  SPACED_LOCAL_PATH_REGEXES,
  terminalLinkRangesOverlap,
  trimSpacedPathTrailingProse,
  trimTerminalLinkTrailingWhitespace,
  WORD_TOKEN_REGEX
} from './terminal-link-ranges'
import type { DetectedTerminalLinkRange } from './terminal-link-ranges'
import type { ParsedTerminalFileLink } from './terminal-link-types'

const EXTENSIONLESS_FILENAMES = new Set([
  'Makefile',
  'Dockerfile',
  'Rakefile',
  'Gemfile',
  'Procfile',
  'LICENSE',
  'README',
  'CHANGELOG',
  'AUTHORS',
  'NOTICE',
  'CONTRIBUTING'
])

const BARE_FILENAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._+-]*$/
const MAX_BARE_FILENAME_TOKEN_LENGTH = 120

function looksLikeFilename(token: string): boolean {
  if (token.length < 2 || token.length > 100 || !BARE_FILENAME_PATTERN.test(token)) {
    return false
  }
  if (/^\d+$/.test(token)) {
    return false
  }
  return token.includes('.') ? !/^\.+$/.test(token) : EXTENSIONLESS_FILENAMES.has(token)
}

function toParsedLink(range: DetectedTerminalLinkRange): ParsedTerminalFileLink | null {
  const parsed = parseExplicitFileLinkTarget(range.text)
  if (!parsed) {
    return null
  }
  return {
    pathText: parsed.pathText,
    line: parsed.line,
    column: parsed.column,
    startIndex: range.startIndex,
    endIndex: range.endIndex,
    displayText: range.text
  }
}

function sortLinksByPosition(links: ParsedTerminalFileLink[]): ParsedTerminalFileLink[] {
  return links.sort((left, right) =>
    left.startIndex === right.startIndex
      ? right.endIndex - left.endIndex
      : left.startIndex - right.startIndex
  )
}

function detectSpacedLocalPathLinks(
  lineText: string,
  includeLineEndingPrefixCandidates = false
): ParsedTerminalFileLink[] {
  const links: ParsedTerminalFileLink[] = []
  const claimedRanges: [number, number][] = []
  for (const regex of SPACED_LOCAL_PATH_REGEXES) {
    for (const range of detectTerminalLinkRanges(lineText, regex)) {
      if (!acceptsSpacedTerminalLinkRange(lineText, range, regex)) {
        continue
      }
      if (terminalLinkRangesOverlap(range, claimedRanges) || isInsideUriScheme(lineText, range)) {
        continue
      }
      const candidateRanges =
        includeLineEndingPrefixCandidates && isLineEndingSpacedPathRegex(regex)
          ? [range, ...buildLineEndingSpacedPathPrefixRanges(range)]
          : [range]
      const candidateLinks = candidateRanges
        .map((candidateRange) =>
          toParsedLink(
            trimSpacedPathTrailingProse(trimTerminalLinkTrailingWhitespace(candidateRange))
          )
        )
        .filter((link): link is ParsedTerminalFileLink => link !== null)
      const link = candidateLinks[0]
      if (link) {
        links.push(...candidateLinks)
        insertClaimedTerminalLinkRange(claimedRanges, [link.startIndex, link.endIndex])
      }
    }
  }
  return links
}

function detectLocalPathLinks(
  lineText: string,
  includeLineEndingPrefixCandidates = false
): ParsedTerminalFileLink[] {
  if (!hasPathSeparator(lineText)) {
    return []
  }
  const links = detectSpacedLocalPathLinks(lineText, includeLineEndingPrefixCandidates)
  const spacedRanges = mergeTerminalLinkRanges(
    links.map(({ startIndex, endIndex }): [number, number] => [startIndex, endIndex])
  )
  for (const range of detectTerminalLinkRanges(lineText, LOCAL_PATH_REGEX)) {
    if (
      terminalLinkRangesOverlap(range, spacedRanges) ||
      isInsideUriScheme(lineText, range) ||
      !hasPathSeparator(range.text)
    ) {
      continue
    }
    const link = toParsedLink(range)
    if (link) {
      links.push(link)
    }
  }
  return sortLinksByPosition(links)
}

function detectBareFilenameLinks(
  lineText: string,
  claimedRanges: readonly [number, number][]
): ParsedTerminalFileLink[] {
  const links: ParsedTerminalFileLink[] = []
  for (const range of detectTerminalLinkRanges(lineText, WORD_TOKEN_REGEX)) {
    if (
      terminalLinkRangesOverlap(range, claimedRanges) ||
      range.text.length > MAX_BARE_FILENAME_TOKEN_LENGTH
    ) {
      continue
    }
    const link = toParsedLink(range)
    if (link && looksLikeFilename(link.pathText)) {
      links.push(link)
    }
  }
  return links
}

function extractLinks(
  lineText: string,
  includeLineEndingPrefixCandidates: boolean
): ParsedTerminalFileLink[] {
  const pathLinks = detectLocalPathLinks(lineText, includeLineEndingPrefixCandidates)
  const claimed = mergeTerminalLinkRanges(
    pathLinks.map(({ startIndex, endIndex }): [number, number] => [startIndex, endIndex])
  )
  pathLinks.push(...detectBareFilenameLinks(lineText, claimed))
  return pathLinks
}

export function extractTerminalFileLinks(lineText: string): ParsedTerminalFileLink[] {
  return extractLinks(lineText, false)
}

export function extractTerminalFileLinkCandidates(lineText: string): ParsedTerminalFileLink[] {
  return extractLinks(lineText, true)
}
