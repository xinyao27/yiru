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
import { computeTrustedHash, computeTrustKey, type CodexTrustEntry } from './config-toml-trust'
import { normalizeHookTrustKeyForLookup, parseTrustKey } from './config-toml-trust-key'
import { normalizeCodexHookSourcePath, usesWindowsPathSeparators } from './config-toml-trust-paths'

export type TrustBlockRange = { start: number; headerLineEnd: number; end: number }

export function upsertHookTrustEntriesInContent(
  existingContent: string,
  entries: readonly CodexTrustEntry[]
): string {
  const existing =
    existingContent.charCodeAt(0) === 0xfeff ? existingContent.slice(1) : existingContent
  let updated = entries.some((entry) =>
    usesWindowsPathSeparators(normalizeCodexHookSourcePath(entry.sourcePath))
  )
    ? ensureHooksStateParentTable(existing)
    : existing
  for (const entry of entries) {
    updated = upsertTrustBlocks(
      updated,
      getTrustKeyWriteVariants(computeTrustKey(entry)),
      entry.trustedHash ?? computeTrustedHash(entry),
      entry.enabled
    )
  }
  return updated
}

export function removeHookTrustEntriesFromContent(
  content: string,
  keys: readonly string[]
): string {
  const ranges = findTrustBlockRangesForNormalizedKeys(
    content,
    new Set(keys.map(normalizeHookTrustKeyForLookup))
  )
  if (ranges.length === 0) {
    return content
  }
  let cursor = 0
  let updated = ''
  for (const range of ranges) {
    updated += content.slice(cursor, range.start)
    cursor = range.end
  }
  return updated + content.slice(cursor)
}

export function parseHookStateHeaderKey(line: string): string | null {
  const trimmed = line.trimStart()
  const prefix = /^\[[ \t]*hooks[ \t]*\.[ \t]*state[ \t]*\.[ \t]*/.exec(trimmed)
  if (!prefix) {
    return null
  }
  const parsedKey = parseTomlSingleLineString(trimmed, prefix[0].length)
  if (!parsedKey) {
    return null
  }
  let index = skipTomlInlineWhitespace(trimmed, parsedKey.endIndex)
  if (trimmed[index] !== ']') {
    return null
  }
  index = skipTomlInlineWhitespace(trimmed, index + 1)
  return index === trimmed.length || trimmed[index] === '#' ? parsedKey.value : null
}

export function findTrustBlockRangesForNormalizedKeys(
  content: string,
  normalizedKeys: ReadonlySet<string>
): TrustBlockRange[] {
  const ranges: TrustBlockRange[] = []
  if (normalizedKeys.size === 0) {
    return ranges
  }
  let cursor = 0
  let scanState = createTomlLineScanState()
  while (cursor < content.length) {
    const newlineIndex = content.indexOf('\n', cursor)
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex
    const rawLine = content.slice(cursor, lineEnd)
    const lineWithoutCr = rawLine.replace(/\r$/, '')
    const line =
      cursor === 0 && lineWithoutCr.charCodeAt(0) === 0xfeff
        ? lineWithoutCr.slice(1)
        : lineWithoutCr
    const nextCursor = newlineIndex === -1 ? content.length : newlineIndex + 1
    const key = isTomlStructuralLine(scanState) ? parseHookStateHeaderKey(line) : null
    if (key !== null && normalizedKeys.has(normalizeHookTrustKeyForLookup(key))) {
      const headerLineEnd = rawLine.endsWith('\r') ? lineEnd - 1 : lineEnd
      const nextHeader = findNextTableHeader(content.slice(headerLineEnd))
      const blockEnd = nextHeader === -1 ? content.length : headerLineEnd + nextHeader
      ranges.push({ start: cursor, headerLineEnd, end: blockEnd })
      cursor = Math.max(blockEnd, nextCursor)
      continue
    }
    scanState = updateTomlLineScanState(scanState, line)
    cursor = nextCursor
  }
  return ranges
}

function upsertTrustBlocks(
  content: string,
  keys: readonly string[],
  hash: string,
  explicitEnabled?: boolean
): string {
  const ranges = keys
    .flatMap((key) =>
      findTrustBlockRangesForNormalizedKeys(content, new Set([normalizeHookTrustKeyForLookup(key)]))
    )
    .filter(
      (range, index, all) =>
        all.findIndex(
          (candidate) => candidate.start === range.start && candidate.end === range.end
        ) === index
    )
    .sort((left, right) => left.start - right.start)
  if (ranges.length === 0) {
    const block = buildTrustBlocks(keys, hash, explicitEnabled ?? true)
    if (!content) {
      return `${block}\n`
    }
    const separator = content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n'
    return `${content}${separator}${block}\n`
  }
  const enabled =
    explicitEnabled ??
    !ranges.some((range) => {
      const block = content.slice(range.headerLineEnd, range.end)
      const match = /^[ \t]*enabled[ \t]*=[ \t]*(true|false)[ \t\r]*(?:#.*)?$/m.exec(block)
      return match?.[1] === 'false'
    })
  const block = buildTrustBlocks(keys, hash, enabled)
  let cursor = 0
  let deduped = ''
  ranges.forEach((range, index) => {
    deduped += content.slice(cursor, range.start)
    if (index === 0) {
      deduped += `${block}\n`
    }
    cursor = range.end
  })
  return deduped + content.slice(cursor)
}

function buildTrustBlocks(keys: readonly string[], hash: string, enabled: boolean): string {
  return keys.map((key) => buildTrustBlock(key, hash, enabled)).join('\n\n')
}

function buildTrustBlock(key: string, hash: string, enabled: boolean): string {
  return [
    `[hooks.state.${formatHookStateTableKey(key)}]`,
    `enabled = ${enabled}`,
    `trusted_hash = "${escapeTomlString(hash)}"`
  ].join('\n')
}

function formatHookStateTableKey(key: string): string {
  const parsed = parseTrustKey(key)
  if (parsed && usesWindowsPathSeparators(parsed.sourcePath) && !key.includes("'")) {
    return `'${key}'`
  }
  return `"${escapeTomlString(key)}"`
}

function getTrustKeyWriteVariants(key: string): string[] {
  const parsed = parseTrustKey(key)
  if (!parsed || !usesWindowsPathSeparators(parsed.sourcePath)) {
    return [key]
  }
  const suffix = `:${parsed.eventLabel}:${parsed.groupIndex}:${parsed.handlerIndex}`
  return [
    `${parsed.sourcePath.replace(/\//g, '\\')}${suffix}`,
    `${parsed.sourcePath.replace(/\\/g, '/')}${suffix}`
  ].filter((variant, index, variants) => variants.indexOf(variant) === index)
}

function ensureHooksStateParentTable(content: string): string {
  if (/^[ \t]*\[hooks\.state\][ \t]*(?:#[^\r\n]*)?$/m.test(content)) {
    return content
  }
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const parent = `[hooks.state]${eol}`
  const hookHeader = /^[ \t]*\[hooks\.state\.(?:"|')/m.exec(content)
  if (hookHeader) {
    return `${content.slice(0, hookHeader.index)}${parent}${eol}${content.slice(hookHeader.index)}`
  }
  if (!content) {
    return parent
  }
  const separator = content.endsWith(`${eol}${eol}`) ? '' : content.endsWith(eol) ? eol : eol + eol
  return `${content}${separator}${parent}`
}
