import type { CodexEventLabel } from './config-toml-trust'
import {
  normalizeCodexHookSourcePath,
  normalizeCodexProjectPathForLookup
} from './config-toml-trust-paths'

export function parseTrustKey(key: string): {
  sourcePath: string
  eventLabel: CodexEventLabel
  groupIndex: number
  handlerIndex: number
} | null {
  // Why: source paths can contain colons, so parse from the final three.
  const lastColon = key.lastIndexOf(':')
  if (lastColon === -1) {
    return null
  }
  const handler = key.slice(lastColon + 1)
  if (!isCanonicalNonNegativeInt(handler)) {
    return null
  }
  const secondLast = key.lastIndexOf(':', lastColon - 1)
  if (secondLast === -1) {
    return null
  }
  const group = key.slice(secondLast + 1, lastColon)
  if (!isCanonicalNonNegativeInt(group)) {
    return null
  }
  const thirdLast = key.lastIndexOf(':', secondLast - 1)
  if (thirdLast === -1) {
    return null
  }
  const eventLabel = key.slice(thirdLast + 1, secondLast)
  if (!isCodexEventLabel(eventLabel)) {
    return null
  }
  const sourcePath = key.slice(0, thirdLast)
  if (!sourcePath) {
    return null
  }
  return {
    sourcePath,
    eventLabel,
    groupIndex: Number(group),
    handlerIndex: Number(handler)
  }
}

export function normalizeHookTrustKeyForLookup(key: string): string {
  const parsed = parseTrustKey(key)
  const foldedPath = normalizeCodexProjectPathForLookup(
    parsed
      ? parsed.sourcePath.startsWith('//')
        ? parsed.sourcePath
        : normalizeCodexHookSourcePath(parsed.sourcePath)
      : key
  )
  return parsed
    ? `${foldedPath}:${parsed.eventLabel}:${parsed.groupIndex}:${parsed.handlerIndex}`
    : foldedPath
}

function isCanonicalNonNegativeInt(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value)
}

function isCodexEventLabel(value: string): value is CodexEventLabel {
  return (
    value === 'pre_tool_use' ||
    value === 'permission_request' ||
    value === 'post_tool_use' ||
    value === 'pre_compact' ||
    value === 'post_compact' ||
    value === 'session_start' ||
    value === 'user_prompt_submit' ||
    value === 'subagent_start' ||
    value === 'subagent_stop' ||
    value === 'stop'
  )
}
