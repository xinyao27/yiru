import {
  createTomlLineScanState,
  isTomlStructuralLine,
  updateTomlLineScanState
} from './config-toml-line-scan'
import {
  escapeTomlString,
  findNextTableHeader,
  parseTomlSingleLineString,
  skipTomlInlineWhitespace
} from './config-toml-syntax'
import type { CodexProjectTrustLevel } from './config-toml-trust'
import {
  getCodexCanonicalProjectPath,
  normalizeCodexProjectPathForLookup
} from './config-toml-trust-paths'

export function upsertProjectTrustLevelInContent(
  existingContent: string,
  projectPath: string,
  trustLevel: CodexProjectTrustLevel,
  options?: { alreadyCanonical?: boolean }
): string {
  const existing =
    existingContent.charCodeAt(0) === 0xfeff ? existingContent.slice(1) : existingContent
  const trustedProjectPath = options?.alreadyCanonical
    ? projectPath
    : getCodexCanonicalProjectPath(projectPath)
  const headerLineEnd = findProjectHeaderLineEnd(existing, trustedProjectPath)
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const trustLine = `trust_level = "${trustLevel}"`
  if (headerLineEnd === null) {
    const block = [`[projects."${escapeTomlString(trustedProjectPath)}"]`, trustLine].join(eol)
    if (!existing) {
      return `${block}${eol}`
    }
    const separator = existing.endsWith(`${eol}${eol}`)
      ? ''
      : existing.endsWith(eol)
        ? eol
        : eol + eol
    return `${existing}${separator}${block}${eol}`
  }
  const after = existing.slice(headerLineEnd)
  const nextHeader = findNextTableHeader(after)
  const blockEnd = nextHeader === -1 ? existing.length : headerLineEnd + nextHeader
  const existingBlock = existing.slice(headerLineEnd, blockEnd)
  const trustPattern =
    /^[ \t]*trust_level[ \t]*=[ \t]*(?:"(?:trusted|untrusted)"|'(?:trusted|untrusted)')[ \t\r]*(?:#.*)?$/m
  if (trustPattern.test(existingBlock)) {
    return (
      existing.slice(0, headerLineEnd) +
      existingBlock.replace(trustPattern, trustLine) +
      existing.slice(blockEnd)
    )
  }
  return `${existing.slice(0, headerLineEnd)}${eol}${trustLine}${existing.slice(headerLineEnd)}`
}

export function parseCodexProjectHeaderPath(line: string): string | null {
  const trimmed = line.replace(/\r$/, '').trimStart()
  const prefix = /^\[[ \t]*projects[ \t]*\.[ \t]*/.exec(trimmed)
  if (!prefix) {
    return null
  }
  const parsedPath = parseTomlSingleLineString(trimmed, prefix[0].length)
  if (!parsedPath) {
    return null
  }
  let index = skipTomlInlineWhitespace(trimmed, parsedPath.endIndex)
  if (trimmed[index] !== ']') {
    return null
  }
  index = skipTomlInlineWhitespace(trimmed, index + 1)
  return index === trimmed.length || trimmed[index] === '#' ? parsedPath.value : null
}

function findProjectHeaderLineEnd(content: string, projectPath: string): number | null {
  const lookupPath = normalizeCodexProjectPathForLookup(projectPath)
  let cursor = 0
  let scanState = createTomlLineScanState()
  while (cursor < content.length) {
    const newlineIndex = content.indexOf('\n', cursor)
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex
    const rawLine = content.slice(cursor, lineEnd)
    const line = rawLine.replace(/\r$/, '')
    const existingPath = isTomlStructuralLine(scanState) ? parseCodexProjectHeaderPath(line) : null
    if (existingPath !== null && normalizeCodexProjectPathForLookup(existingPath) === lookupPath) {
      return rawLine.endsWith('\r') ? lineEnd - 1 : lineEnd
    }
    scanState = updateTomlLineScanState(scanState, line)
    if (newlineIndex === -1) {
      return null
    }
    cursor = newlineIndex + 1
  }
  return null
}
