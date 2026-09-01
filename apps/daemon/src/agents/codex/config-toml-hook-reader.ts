import { parseHookStateHeaderKey } from './config-toml-hook-blocks'
import {
  createTomlLineScanState,
  isTomlStructuralLine,
  updateTomlLineScanState
} from './config-toml-line-scan'
import { findNextTableHeader, unescapeTomlString } from './config-toml-syntax'
import type { CodexHookTrustState } from './config-toml-trust'
import { normalizeHookTrustKeyForLookup } from './config-toml-trust-key'

class HookTrustEntryMap extends Map<string, CodexHookTrustState> {
  override get(key: string): CodexHookTrustState | undefined {
    return super.get(normalizeHookTrustKeyForLookup(key))
  }

  override has(key: string): boolean {
    return super.has(normalizeHookTrustKeyForLookup(key))
  }

  override delete(key: string): boolean {
    return super.delete(normalizeHookTrustKeyForLookup(key))
  }

  override set(key: string, value: CodexHookTrustState): this {
    return super.set(normalizeHookTrustKeyForLookup(key), value)
  }
}

export function readHookTrustEntriesFromContent(content: string): Map<string, CodexHookTrustState> {
  const result = new HookTrustEntryMap()
  const conflictingHashes = new Set<string>()
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
    if (key !== null) {
      const nextHeader = findNextTableHeader(content.slice(nextCursor))
      const blockEnd = nextHeader === -1 ? content.length : nextCursor + nextHeader
      const blockState = readHookTrustBlockState(content.slice(nextCursor, blockEnd))
      const normalizedKey = normalizeHookTrustKeyForLookup(key)
      const existingState = result.get(normalizedKey)
      const trustedHash =
        blockState.trustedHashes.size === 1
          ? blockState.trustedHashes.values().next().value
          : undefined
      if (
        blockState.trustedHashes.size > 1 ||
        (trustedHash !== undefined &&
          existingState?.trustedHash !== undefined &&
          existingState.trustedHash !== trustedHash)
      ) {
        conflictingHashes.add(normalizedKey)
      }
      result.set(normalizedKey, {
        trustedHash: conflictingHashes.has(normalizedKey)
          ? undefined
          : (trustedHash ?? existingState?.trustedHash),
        enabled:
          existingState?.enabled === false || blockState.enabled === false
            ? false
            : (blockState.enabled ?? existingState?.enabled)
      })
      cursor = nextCursor
      continue
    }
    scanState = updateTomlLineScanState(scanState, line)
    cursor = nextCursor
  }
  return result
}

export function createEmptyHookTrustEntryMap(): Map<string, CodexHookTrustState> {
  return new HookTrustEntryMap()
}

function readHookTrustBlockState(block: string): {
  trustedHashes: Set<string>
  enabled?: boolean
} {
  const trustedHashes = new Set<string>()
  let enabled: boolean | undefined
  let cursor = 0
  let scanState = createTomlLineScanState()
  while (cursor < block.length) {
    const newlineIndex = block.indexOf('\n', cursor)
    const lineEnd = newlineIndex === -1 ? block.length : newlineIndex
    const line = block.slice(cursor, lineEnd).replace(/\r$/, '')
    if (isTomlStructuralLine(scanState)) {
      const hashMatch = /^[ \t]*trusted_hash[ \t]*=[ \t]*"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/.exec(
        line
      )
      if (hashMatch) {
        trustedHashes.add(unescapeTomlString(hashMatch[1]))
      }
      const enabledMatch = /^[ \t]*enabled[ \t]*=[ \t]*(true|false)[ \t]*(?:#.*)?$/.exec(line)
      if (enabledMatch) {
        enabled = enabled !== false && enabledMatch[1] === 'true'
      }
    }
    scanState = updateTomlLineScanState(scanState, line)
    cursor = newlineIndex === -1 ? block.length : newlineIndex + 1
  }
  return { trustedHashes, enabled }
}
