import type {
  ClaudeUsageRange,
  ClaudeUsageScope,
  ClaudeUsageSummary
} from '@yiru/runtime-protocol/workbench/claude-usage-types'

import { getFilteredClaudeUsageDaily, getFilteredClaudeUsageSessions } from './query-scope'
import type { ClaudeUsagePersistedState } from './types'

export function buildClaudeUsageSummary(
  state: ClaudeUsagePersistedState,
  scope: ClaudeUsageScope,
  range: ClaudeUsageRange
): ClaudeUsageSummary {
  const filteredDaily = getFilteredClaudeUsageDaily(state, scope, range)
  const filteredSessions = getFilteredClaudeUsageSessions(state, scope, range)
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let turns = 0
  let zeroCacheReadTurns = 0
  const byModel = new Map<string, number>()
  const byProject = new Map<string, number>()
  let estimatedCostUsd = 0
  let hasAnyBillableCost = false
  let hasUnpricedCost = false

  for (const row of filteredDaily) {
    inputTokens += row.inputTokens
    outputTokens += row.outputTokens
    cacheReadTokens += row.cacheReadTokens
    cacheWriteTokens += row.cacheWriteTokens
    turns += row.turnCount
    zeroCacheReadTurns += row.zeroCacheReadTurnCount
    const modelKey = row.model ?? 'Unknown model'
    byModel.set(modelKey, (byModel.get(modelKey) ?? 0) + row.inputTokens + row.outputTokens)
    byProject.set(
      row.projectLabel,
      (byProject.get(row.projectLabel) ?? 0) + row.inputTokens + row.outputTokens
    )
    hasUnpricedCost ||= row.unpricedTokens > 0
    if (row.estimatedCostUsd !== null) {
      hasAnyBillableCost = true
      estimatedCostUsd += row.estimatedCostUsd
    }
  }

  const topModel = [...byModel.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
  const topProject =
    [...byProject.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
  return {
    scope,
    range,
    sessions: filteredSessions.length,
    turns,
    zeroCacheReadTurns,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheReuseRate:
      inputTokens + cacheReadTokens > 0 ? cacheReadTokens / (inputTokens + cacheReadTokens) : null,
    estimatedCostUsd: hasUnpricedCost || !hasAnyBillableCost ? null : estimatedCostUsd,
    topModel,
    topProject,
    // Why: empty state is scope/range-specific; global persisted data would
    // hide the intended no-usage state for a filtered view.
    hasAnyClaudeData: filteredSessions.length > 0 || filteredDaily.length > 0
  }
}
