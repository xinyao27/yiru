import type {
  CodexUsageBreakdownKind,
  CodexUsageBreakdownRow,
  CodexUsageRange,
  CodexUsageScope
} from '~shared/codex-usage-types'

import {
  getFilteredCodexUsageDaily,
  getFilteredCodexUsageSessions,
  getScopedCodexSessionModels
} from './query-scope'
import type { CodexUsagePersistedState } from './types'

export function buildCodexUsageBreakdown(
  state: CodexUsagePersistedState,
  scope: CodexUsageScope,
  range: CodexUsageRange,
  kind: CodexUsageBreakdownKind
): CodexUsageBreakdownRow[] {
  const rows = new Map<string, CodexUsageBreakdownRow>()
  const unpricedKeys = new Set<string>()
  for (const daily of getFilteredCodexUsageDaily(state, scope, range)) {
    const key = kind === 'model' ? (daily.model ?? 'unknown') : daily.projectKey
    const label = kind === 'model' ? (daily.model ?? 'Unknown model') : daily.projectLabel
    const existing = rows.get(key) ?? {
      key,
      label,
      sessions: 0,
      events: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: null,
      hasInferredPricing: false
    }
    existing.events += daily.eventCount
    existing.inputTokens += daily.inputTokens
    existing.cachedInputTokens += daily.cachedInputTokens
    existing.outputTokens += daily.outputTokens
    existing.reasoningOutputTokens += daily.reasoningOutputTokens
    existing.totalTokens += daily.totalTokens
    existing.hasInferredPricing ||= daily.hasInferredPricing
    existing.estimatedCostUsd = addKnownCost(existing.estimatedCostUsd, daily.estimatedCostUsd)
    if (daily.unpricedTokens > 0) {
      unpricedKeys.add(key)
    }
    rows.set(key, existing)
  }
  for (const session of getFilteredCodexUsageSessions(state, scope, range)) {
    const keys =
      kind === 'model'
        ? getScopedCodexSessionModels(session, scope).map((model) => model.modelKey)
        : session.locationBreakdown
            .filter((entry) => scope === 'all' || entry.worktreeId !== null)
            .map((entry) => entry.locationKey)
    for (const key of new Set(keys)) {
      const row = rows.get(key)
      if (row) {
        row.sessions++
      }
    }
  }
  return [...rows.values()]
    .map((row) => (unpricedKeys.has(row.key) ? { ...row, estimatedCostUsd: null } : row))
    .sort((left, right) => right.totalTokens - left.totalTokens)
}

function addKnownCost(left: number | null, right: number | null): number | null {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0)
}
