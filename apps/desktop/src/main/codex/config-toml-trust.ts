import { createHash } from 'node:crypto'

import { normalizeCodexHookSourcePath } from './config-toml-trust-paths'

export type CodexEventLabel =
  | 'pre_tool_use'
  | 'permission_request'
  | 'post_tool_use'
  | 'pre_compact'
  | 'post_compact'
  | 'session_start'
  | 'user_prompt_submit'
  | 'subagent_start'
  | 'subagent_stop'
  | 'stop'

export type CodexTrustEntry = {
  sourcePath: string
  eventLabel: CodexEventLabel
  groupIndex: number
  handlerIndex: number
  command: string
  timeoutSec?: number
  async?: boolean
  matcher?: string
  statusMessage?: string
  trustedHash?: string
  enabled?: boolean
}

export type CodexHookTrustState = { trustedHash?: string; enabled?: boolean }
export type CodexProjectTrustLevel = 'trusted' | 'untrusted'

export function computeTrustedHash(entry: CodexTrustEntry): string {
  const handler: Record<string, unknown> = {
    type: 'command',
    command: entry.command,
    timeout: Math.max(1, entry.timeoutSec ?? 600),
    async: entry.async ?? false
  }
  if (entry.statusMessage !== undefined) {
    handler.statusMessage = entry.statusMessage
  }
  const identity: Record<string, unknown> = {
    event_name: entry.eventLabel,
    hooks: [handler]
  }
  const matcher = matcherPatternForEvent(entry.eventLabel, entry.matcher)
  if (matcher !== undefined) {
    identity.matcher = matcher
  }
  const serialized = JSON.stringify(canonicalize(identity))
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`
}

export function computeTrustKey(entry: CodexTrustEntry): string {
  return `${normalizeCodexHookSourcePath(entry.sourcePath)}:${entry.eventLabel}:${entry.groupIndex}:${entry.handlerIndex}`
}

function matcherPatternForEvent(
  eventLabel: CodexEventLabel,
  matcher: string | undefined
): string | undefined {
  switch (eventLabel) {
    case 'user_prompt_submit':
    case 'stop':
      return undefined
    case 'pre_tool_use':
    case 'permission_request':
    case 'post_tool_use':
    case 'pre_compact':
    case 'post_compact':
    case 'session_start':
    case 'subagent_start':
    case 'subagent_stop':
      return matcher
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export {
  removeHookTrustEntriesFromContent,
  upsertHookTrustEntriesInContent
} from './config-toml-hook-blocks'
export { readHookTrustEntriesFromContent } from './config-toml-hook-reader'
export {
  parseCodexProjectHeaderPath,
  upsertProjectTrustLevelInContent
} from './config-toml-project-trust'
export { escapeTomlString } from './config-toml-syntax'
export {
  readHookTrustEntries,
  removeHookTrustEntries,
  upsertHookTrustEntries,
  upsertProjectTrustLevel,
  writeConfigAtomically
} from './config-toml-trust-file'
export { normalizeHookTrustKeyForLookup, parseTrustKey } from './config-toml-trust-key'
export {
  codexHookSourcePathsEqual,
  getCodexExplicitHomeHookSourcePath,
  normalizeCodexHookSourcePath,
  normalizeCodexProjectPathForLookup,
  normalizeCodexProjectPathForRevocationLookup
} from './config-toml-trust-paths'
