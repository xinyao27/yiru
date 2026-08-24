import { ensureNumber } from './session-discovery'
import type { CodexUsageDeltaResolution, CodexUsageRawUsage } from './usage-record-model'

export function normalizeRawUsage(value: unknown): CodexUsageRawUsage | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const inputTokens = Math.max(ensureNumber(record.input_tokens), 0)
  const cachedInputTokens = Math.max(
    ensureNumber(record.cached_input_tokens ?? record.cache_read_input_tokens),
    0
  )
  const cacheWriteTokens = Math.max(
    ensureNumber(record.cache_write_input_tokens ?? record.cache_write_tokens),
    0
  )
  const outputTokens = Math.max(ensureNumber(record.output_tokens), 0)
  const reasoningOutputTokens = Math.min(
    Math.max(ensureNumber(record.reasoning_output_tokens), 0),
    outputTokens
  )
  // Why: Codex input already includes its cached portion, while reasoning is
  // included in output. Adding either subset again inflates provider totals.
  const totalTokens = inputTokens + outputTokens

  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens
  }
}

function subtractRawUsage(
  current: CodexUsageRawUsage,
  previous: CodexUsageRawUsage | null
): CodexUsageRawUsage {
  return {
    inputTokens: Math.max(current.inputTokens - (previous?.inputTokens ?? 0), 0),
    cachedInputTokens: Math.max(current.cachedInputTokens - (previous?.cachedInputTokens ?? 0), 0),
    cacheWriteTokens: Math.max(current.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0), 0),
    outputTokens: Math.max(current.outputTokens - (previous?.outputTokens ?? 0), 0),
    reasoningOutputTokens: Math.max(
      current.reasoningOutputTokens - (previous?.reasoningOutputTokens ?? 0),
      0
    ),
    totalTokens: Math.max(current.totalTokens - (previous?.totalTokens ?? 0), 0)
  }
}

function addRawUsage(left: CodexUsageRawUsage, right: CodexUsageRawUsage): CodexUsageRawUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningOutputTokens: left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens
  }
}

function rawUsageEquals(left: CodexUsageRawUsage, right: CodexUsageRawUsage): boolean {
  return (
    left.inputTokens === right.inputTokens &&
    left.cachedInputTokens === right.cachedInputTokens &&
    left.cacheWriteTokens === right.cacheWriteTokens &&
    left.outputTokens === right.outputTokens &&
    left.reasoningOutputTokens === right.reasoningOutputTokens
  )
}

function rawUsageIsMonotonic(current: CodexUsageRawUsage, previous: CodexUsageRawUsage): boolean {
  return (
    current.inputTokens >= previous.inputTokens &&
    current.cachedInputTokens >= previous.cachedInputTokens &&
    current.cacheWriteTokens >= previous.cacheWriteTokens &&
    current.outputTokens >= previous.outputTokens &&
    current.reasoningOutputTokens >= previous.reasoningOutputTokens
  )
}

function rawUsageMagnitude(usage: CodexUsageRawUsage): number {
  return (
    usage.inputTokens +
    usage.cachedInputTokens +
    usage.cacheWriteTokens +
    usage.outputTokens +
    usage.reasoningOutputTokens
  )
}

function looksLikeStaleRegression(
  current: CodexUsageRawUsage,
  previous: CodexUsageRawUsage,
  last: CodexUsageRawUsage
): boolean {
  const previousTotal = rawUsageMagnitude(previous)
  const currentTotal = rawUsageMagnitude(current)
  const lastTotal = rawUsageMagnitude(last)
  if (previousTotal <= 0 || currentTotal <= 0 || lastTotal <= 0) {
    return false
  }
  return currentTotal * 100 >= previousTotal * 98 || currentTotal + lastTotal * 2 >= previousTotal
}

export function resolveCodexUsageDelta(
  totalUsage: CodexUsageRawUsage | null,
  lastUsage: CodexUsageRawUsage | null,
  previousTotals: CodexUsageRawUsage | null
): CodexUsageDeltaResolution | null {
  if (totalUsage && lastUsage && previousTotals) {
    if (rawUsageEquals(totalUsage, previousTotals)) {
      return null
    }
    if (
      !rawUsageIsMonotonic(totalUsage, previousTotals) &&
      looksLikeStaleRegression(totalUsage, previousTotals, lastUsage)
    ) {
      return null
    }
    // Why: Codex totals are mutable snapshots after compaction/resume. The
    // last_token_usage payload is the billable increment; totals are the baseline.
    return { kind: 'event', delta: lastUsage, nextTotals: totalUsage }
  }

  if (totalUsage && lastUsage) {
    return { kind: 'event', delta: lastUsage, nextTotals: totalUsage }
  }

  if (totalUsage && previousTotals) {
    if (rawUsageEquals(totalUsage, previousTotals)) {
      return null
    }
    if (!rawUsageIsMonotonic(totalUsage, previousTotals)) {
      return { kind: 'baseline', nextTotals: totalUsage }
    }
    return {
      kind: 'event',
      delta: subtractRawUsage(totalUsage, previousTotals),
      nextTotals: totalUsage
    }
  }

  if (totalUsage) {
    return { kind: 'event', delta: totalUsage, nextTotals: totalUsage }
  }

  if (lastUsage && previousTotals) {
    return { kind: 'event', delta: lastUsage, nextTotals: addRawUsage(previousTotals, lastUsage) }
  }

  if (lastUsage) {
    return { kind: 'event', delta: lastUsage, nextTotals: null }
  }

  return null
}
