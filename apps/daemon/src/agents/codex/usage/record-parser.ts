import { buildCodexUsageEventKey } from './event-key'
import { normalizeRawUsage, resolveCodexUsageDelta } from './token-delta'
import type { CodexUsageParsedEvent } from './types'
import type { CodexUsageParseContext, CodexUsageRawRecord } from './usage-record-model'

const FORK_COPY_MAX_GAP_MS = 1_000

function extractString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isForkedSessionMeta(payload: Record<string, unknown>): boolean {
  if (extractString(payload.forked_from_id)) {
    return true
  }
  const source = payload.source
  if (source == null || typeof source !== 'object') {
    return false
  }
  const subagent = (source as Record<string, unknown>).subagent
  if (subagent == null || typeof subagent !== 'object') {
    return false
  }
  const threadSpawn = (subagent as Record<string, unknown>).thread_spawn
  return (
    threadSpawn != null &&
    typeof threadSpawn === 'object' &&
    extractString((threadSpawn as Record<string, unknown>).parent_thread_id) !== null
  )
}

function extractTurnId(value: unknown): string | null {
  if (value == null || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  return (
    extractString(record.turn_id) ??
    extractString(record.turnId) ??
    extractString(record.id) ??
    (record.info && typeof record.info === 'object' ? extractTurnId(record.info) : null)
  )
}

function extractModel(value: unknown): string | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const direct = [extractString(record.model), extractString(record.model_name)].find(
    (candidate) => candidate !== null
  )
  if (direct) {
    return direct
  }

  if (record.info && typeof record.info === 'object') {
    const info = record.info as Record<string, unknown>
    const infoDirect = [extractString(info.model), extractString(info.model_name)].find(
      (candidate) => candidate !== null
    )
    if (infoDirect) {
      return infoDirect
    }
    if (info.metadata && typeof info.metadata === 'object') {
      const metadata = info.metadata as Record<string, unknown>
      const metadataModel = extractString(metadata.model)
      if (metadataModel) {
        return metadataModel
      }
    }
  }

  if (record.metadata && typeof record.metadata === 'object') {
    const metadata = record.metadata as Record<string, unknown>
    return extractString(metadata.model)
  }

  return null
}

export function parseCodexUsageRecord(
  line: string,
  context: CodexUsageParseContext
): CodexUsageParsedEvent | null {
  let parsed: CodexUsageRawRecord
  try {
    parsed = JSON.parse(line) as CodexUsageRawRecord
  } catch {
    return null
  }

  if (!parsed.type || !parsed.payload) {
    return null
  }

  if (parsed.type === 'session_meta') {
    // Why: forked rollouts repeat ancestor metadata after the child's own
    // metadata. Only the first record identifies the file being scanned.
    if (context.sawSessionMeta) {
      return null
    }
    context.sawSessionMeta = true
    context.sessionId = extractString(parsed.payload.id) ?? context.sessionId
    context.sessionCwd = extractString(parsed.payload.cwd)
    context.currentTurnId = null
    if (!context.currentCwd && context.sessionCwd) {
      context.currentCwd = context.sessionCwd
    }
    const metaTimestampMs = parsed.timestamp ? Date.parse(parsed.timestamp) : Number.NaN
    if (Number.isFinite(metaTimestampMs) && isForkedSessionMeta(parsed.payload)) {
      context.suppressingForkCopies = true
      context.forkCopyAnchorMs = metaTimestampMs
    }
    return null
  }

  if (parsed.type === 'turn_context') {
    context.currentCwd =
      extractString(parsed.payload.cwd) ?? context.currentCwd ?? context.sessionCwd
    context.currentModel = extractModel(parsed.payload) ?? context.currentModel
    context.currentTurnId = extractTurnId(parsed.payload) ?? context.currentTurnId
    return null
  }

  if (parsed.type === 'event_msg' && parsed.payload.type === 'task_started') {
    context.currentTurnId = extractTurnId(parsed.payload) ?? context.currentTurnId
    return null
  }

  if (parsed.type !== 'event_msg' || parsed.payload.type !== 'token_count' || !parsed.timestamp) {
    return null
  }

  const info = parsed.payload.info
  if (info == null || typeof info !== 'object') {
    // Why: Codex emits token_count snapshots with null info for rate-limit
    // updates. Treating them as malformed usage would make active sessions look
    // flaky and create false scan errors for perfectly valid logs.
    return null
  }

  const record = info as Record<string, unknown>
  const totalUsage = normalizeRawUsage(record.total_token_usage)
  const lastUsage = normalizeRawUsage(record.last_token_usage)
  if (context.totalOnlyBaselinePending) {
    context.totalOnlyBaselinePending = false
    if (totalUsage && !lastUsage && !context.previousTotals) {
      context.previousTotals = totalUsage
      return null
    }
  }
  const resolvedUsage = resolveCodexUsageDelta(totalUsage, lastUsage, context.previousTotals)
  if (!resolvedUsage) {
    return null
  }
  if (resolvedUsage.kind === 'baseline') {
    context.previousTotals = resolvedUsage.nextTotals
    return null
  }

  let delta = {
    ...resolvedUsage.delta,
    cachedInputTokens: Math.min(
      resolvedUsage.delta.cachedInputTokens,
      resolvedUsage.delta.inputTokens
    )
  }

  // Why: Codex rewrites a fork's copied parent history at the fork instant.
  // The synchronous burst is already represented by the parent rollout; the
  // first event after a real turn-sized gap belongs to the child.
  if (context.suppressingForkCopies) {
    const timestampMs = Date.parse(parsed.timestamp)
    if (
      Number.isFinite(timestampMs) &&
      timestampMs - context.forkCopyAnchorMs < FORK_COPY_MAX_GAP_MS
    ) {
      context.forkCopyAnchorMs = timestampMs
      context.previousTotals = resolvedUsage.nextTotals
      return null
    }
    context.suppressingForkCopies = false
  }

  if (
    delta.inputTokens === 0 &&
    delta.cachedInputTokens === 0 &&
    delta.cacheWriteTokens === 0 &&
    delta.outputTokens === 0 &&
    delta.reasoningOutputTokens === 0 &&
    delta.totalTokens === 0
  ) {
    return null
  }

  context.previousTotals = resolvedUsage.nextTotals

  const resolvedModel = extractModel(parsed.payload) ?? context.currentModel
  const turnId = extractTurnId(parsed.payload) ?? context.currentTurnId
  const hasInferredPricing = resolvedModel === null

  return {
    sessionId: context.sessionId,
    timestamp: parsed.timestamp,
    eventKey: buildCodexUsageEventKey(parsed.timestamp, totalUsage, lastUsage),
    turnId,
    cwd: context.currentCwd ?? context.sessionCwd,
    model: resolvedModel,
    hasInferredPricing,
    inputTokens: delta.inputTokens,
    cachedInputTokens: delta.cachedInputTokens,
    cacheWriteTokens: delta.cacheWriteTokens,
    outputTokens: delta.outputTokens,
    reasoningOutputTokens: delta.reasoningOutputTokens,
    totalTokens: delta.totalTokens
  }
}
