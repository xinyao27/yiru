import type {
  ClaudeUsageBreakdownKind,
  ClaudeUsageBreakdownRow,
  ClaudeUsageDailyPoint,
  ClaudeUsageRange,
  ClaudeUsageScope,
  ClaudeUsageSessionRow
} from '@yiru/runtime-protocol/workbench/claude-usage-types'

import {
  addKnownClaudeCost,
  getFilteredClaudeUsageDaily,
  getFilteredClaudeUsageSessions
} from './query-scope'
import { getSessionProjectLabel } from './scanner'
import type { ClaudeUsagePersistedState } from './types'

export function buildClaudeUsageDaily(
  state: ClaudeUsagePersistedState,
  scope: ClaudeUsageScope,
  range: ClaudeUsageRange
): ClaudeUsageDailyPoint[] {
  const byDay = new Map<string, ClaudeUsageDailyPoint>()
  for (const row of getFilteredClaudeUsageDaily(state, scope, range)) {
    const existing = byDay.get(row.day) ?? {
      day: row.day,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCostUsd: null,
      unpricedTokens: 0
    }
    existing.inputTokens += row.inputTokens
    existing.outputTokens += row.outputTokens
    existing.cacheReadTokens += row.cacheReadTokens
    existing.cacheWriteTokens += row.cacheWriteTokens
    existing.estimatedCostUsd = addKnownClaudeCost(existing.estimatedCostUsd, row.estimatedCostUsd)
    existing.unpricedTokens += row.unpricedTokens
    byDay.set(row.day, existing)
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day))
}

export function buildClaudeUsageBreakdown(
  state: ClaudeUsagePersistedState,
  scope: ClaudeUsageScope,
  range: ClaudeUsageRange,
  kind: ClaudeUsageBreakdownKind
): ClaudeUsageBreakdownRow[] {
  const rows = new Map<string, ClaudeUsageBreakdownRow>()
  const unpricedKeys = new Set<string>()
  const filteredDaily = getFilteredClaudeUsageDaily(state, scope, range)
  const filteredSessions = getFilteredClaudeUsageSessions(state, scope, range)
  for (const daily of filteredDaily) {
    const key = kind === 'model' ? (daily.model ?? 'unknown') : daily.projectKey
    const label = kind === 'model' ? (daily.model ?? 'Unknown model') : daily.projectLabel
    const existing = rows.get(key) ?? {
      key,
      label,
      sessions: 0,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCostUsd: null
    }
    existing.turns += daily.turnCount
    existing.inputTokens += daily.inputTokens
    existing.outputTokens += daily.outputTokens
    existing.cacheReadTokens += daily.cacheReadTokens
    existing.cacheWriteTokens += daily.cacheWriteTokens
    existing.estimatedCostUsd = addKnownClaudeCost(
      existing.estimatedCostUsd,
      daily.estimatedCostUsd
    )
    if (daily.unpricedTokens > 0) {
      unpricedKeys.add(key)
    }
    rows.set(key, existing)
  }

  for (const session of filteredSessions) {
    if (kind === 'model') {
      const row = rows.get(session.model ?? 'unknown')
      if (row) {
        row.sessions += 1
      }
      continue
    }
    const matchingLocations = session.locationBreakdown.filter((entry) =>
      scope === 'all' ? true : entry.worktreeId !== null
    )
    const seen = new Set<string>()
    for (const location of matchingLocations) {
      if (seen.has(location.locationKey)) {
        continue
      }
      seen.add(location.locationKey)
      const row = rows.get(location.locationKey)
      if (row) {
        row.sessions += 1
      }
    }
  }

  return [...rows.values()]
    .map((row) => (unpricedKeys.has(row.key) ? { ...row, estimatedCostUsd: null } : row))
    .sort(
      (left, right) =>
        right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens)
    )
}

export function buildClaudeUsageRecentSessions(
  state: ClaudeUsagePersistedState,
  scope: ClaudeUsageScope,
  range: ClaudeUsageRange,
  limit = 12
): ClaudeUsageSessionRow[] {
  return getFilteredClaudeUsageSessions(state, scope, range)
    .slice(0, limit)
    .map((session) => {
      const matchingLocations = session.locationBreakdown.filter((entry) =>
        scope === 'all' ? true : entry.worktreeId !== null
      )
      const scopedLocations =
        matchingLocations.length > 0 ? matchingLocations : session.locationBreakdown
      const totals = scopedLocations.reduce(
        (accumulator, entry) => {
          accumulator.turns += entry.turnCount
          accumulator.inputTokens += entry.inputTokens
          accumulator.outputTokens += entry.outputTokens
          accumulator.cacheReadTokens += entry.cacheReadTokens
          accumulator.cacheWriteTokens += entry.cacheWriteTokens
          return accumulator
        },
        { turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
      )
      const durationMinutes = Math.max(
        0,
        Math.round(
          (new Date(session.lastTimestamp).getTime() - new Date(session.firstTimestamp).getTime()) /
            60_000
        )
      )
      return {
        sessionId: session.sessionId,
        lastActiveAt: session.lastTimestamp,
        durationMinutes,
        projectLabel: getSessionProjectLabel(scopedLocations),
        branch: session.lastGitBranch,
        model: session.model,
        turns: totals.turns,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens
      }
    })
}
