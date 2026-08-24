import type {
  CodexUsageDailyPoint,
  CodexUsageRange,
  CodexUsageScope,
  CodexUsageSummary
} from '~shared/codex-usage-types'

import { getFilteredCodexUsageDaily, getFilteredCodexUsageSessions } from './query-scope'
import type { CodexUsagePersistedState } from './types'

export function buildCodexUsageSummary(
  state: CodexUsagePersistedState,
  scope: CodexUsageScope,
  range: CodexUsageRange
): CodexUsageSummary {
  const daily = getFilteredCodexUsageDaily(state, scope, range)
  const sessions = getFilteredCodexUsageSessions(state, scope, range)
  let inputTokens = 0
  let cachedInputTokens = 0
  let outputTokens = 0
  let reasoningOutputTokens = 0
  let totalTokens = 0
  let events = 0
  let estimatedCostUsd = 0
  let hasAnyBillableCost = false
  let hasUnpricedCost = false
  const byModel = new Map<string, number>()
  const byProject = new Map<string, number>()
  for (const row of daily) {
    inputTokens += row.inputTokens
    cachedInputTokens += row.cachedInputTokens
    outputTokens += row.outputTokens
    reasoningOutputTokens += row.reasoningOutputTokens
    totalTokens += row.totalTokens
    events += row.eventCount
    const model = row.model ?? 'Unknown model'
    byModel.set(model, (byModel.get(model) ?? 0) + row.totalTokens)
    byProject.set(row.projectLabel, (byProject.get(row.projectLabel) ?? 0) + row.totalTokens)
    hasUnpricedCost ||= row.unpricedTokens > 0
    if (row.estimatedCostUsd !== null) {
      hasAnyBillableCost = true
      estimatedCostUsd += row.estimatedCostUsd
    }
  }
  return {
    scope,
    range,
    sessions: sessions.length,
    events,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
    estimatedCostUsd: hasUnpricedCost || !hasAnyBillableCost ? null : estimatedCostUsd,
    topModel: topAggregateKey(byModel),
    topProject: topAggregateKey(byProject),
    hasAnyCodexData: sessions.length > 0 || daily.length > 0
  }
}

export function buildCodexUsageDaily(
  state: CodexUsagePersistedState,
  scope: CodexUsageScope,
  range: CodexUsageRange
): CodexUsageDailyPoint[] {
  const byDay = new Map<string, CodexUsageDailyPoint>()
  for (const row of getFilteredCodexUsageDaily(state, scope, range)) {
    const existing = byDay.get(row.day) ?? {
      day: row.day,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: null,
      unpricedTokens: 0
    }
    existing.inputTokens += row.inputTokens
    existing.cachedInputTokens += row.cachedInputTokens
    existing.outputTokens += row.outputTokens
    existing.reasoningOutputTokens += row.reasoningOutputTokens
    existing.totalTokens += row.totalTokens
    existing.estimatedCostUsd = addKnownCost(existing.estimatedCostUsd, row.estimatedCostUsd)
    existing.unpricedTokens += row.unpricedTokens
    byDay.set(row.day, existing)
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day))
}

function addKnownCost(left: number | null, right: number | null): number | null {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0)
}

function topAggregateKey(rows: Map<string, number>): string | null {
  return [...rows.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
}
