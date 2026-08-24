import type {
  OpenCodeUsageBreakdownKind,
  OpenCodeUsageBreakdownRow,
  OpenCodeUsageDailyPoint,
  OpenCodeUsageRange,
  OpenCodeUsageScope,
  OpenCodeUsageSessionRow,
  OpenCodeUsageSnapshot,
  OpenCodeUsageSummary
} from '~shared/opencode-usage-types'

import type {
  OpenCodeUsageDailyAggregate,
  OpenCodeUsagePersistedState,
  OpenCodeUsageSession
} from './types'

function getRangeCutoff(range: OpenCodeUsageRange): string | null {
  if (range === 'all') {
    return null
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  now.setDate(now.getDate() - (days - 1))
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getLocalDay(timestamp: string): string | null {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addCost(left: number | null, right: number | null): number | null {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0)
}

function getFilteredDaily(
  state: OpenCodeUsagePersistedState,
  scope: OpenCodeUsageScope,
  range: OpenCodeUsageRange
): OpenCodeUsageDailyAggregate[] {
  const cutoff = getRangeCutoff(range)
  return state.dailyAggregates.filter(
    (row) => !(scope === 'yiru' && !row.worktreeId) && !(cutoff && row.day < cutoff)
  )
}

function getFilteredSessions(
  state: OpenCodeUsagePersistedState,
  scope: OpenCodeUsageScope,
  range: OpenCodeUsageRange
): OpenCodeUsageSession[] {
  const cutoff = getRangeCutoff(range)
  return state.sessions.filter((session) => {
    if (scope === 'yiru' && !session.primaryWorktreeId) {
      return false
    }
    const day = cutoff ? getLocalDay(session.lastTimestamp) : null
    return !cutoff || Boolean(day && day >= cutoff)
  })
}

export function buildOpenCodeUsageSummary(
  state: OpenCodeUsagePersistedState,
  scope: OpenCodeUsageScope,
  range: OpenCodeUsageRange
): OpenCodeUsageSummary {
  const daily = getFilteredDaily(state, scope, range)
  const sessions = getFilteredSessions(state, scope, range)
  let inputTokens = 0
  let cachedInputTokens = 0
  let outputTokens = 0
  let reasoningOutputTokens = 0
  let totalTokens = 0
  let events = 0
  let estimatedCostUsd: number | null = null
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
    estimatedCostUsd = addCost(estimatedCostUsd, row.estimatedCostUsd)
    hasUnpricedCost ||= row.totalTokens > 0 && row.estimatedCostUsd === null
    const model = row.model ?? 'Unknown model'
    byModel.set(model, (byModel.get(model) ?? 0) + row.totalTokens)
    byProject.set(row.projectLabel, (byProject.get(row.projectLabel) ?? 0) + row.totalTokens)
  }
  const topModel = [...byModel.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
  const topProject =
    [...byProject.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
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
    estimatedCostUsd: hasUnpricedCost ? null : estimatedCostUsd,
    topModel,
    topProject,
    hasAnyOpenCodeData: sessions.length > 0 || daily.length > 0
  }
}

export function buildOpenCodeUsageDaily(
  state: OpenCodeUsagePersistedState,
  scope: OpenCodeUsageScope,
  range: OpenCodeUsageRange
): OpenCodeUsageDailyPoint[] {
  const byDay = new Map<string, OpenCodeUsageDailyPoint>()
  for (const row of getFilteredDaily(state, scope, range)) {
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
    if (row.estimatedCostUsd === null) {
      existing.unpricedTokens += row.totalTokens
    }
    existing.estimatedCostUsd =
      existing.unpricedTokens > 0 ? null : addCost(existing.estimatedCostUsd, row.estimatedCostUsd)
    byDay.set(row.day, existing)
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day))
}

export function buildOpenCodeUsageBreakdown(
  state: OpenCodeUsagePersistedState,
  scope: OpenCodeUsageScope,
  range: OpenCodeUsageRange,
  kind: OpenCodeUsageBreakdownKind
): OpenCodeUsageBreakdownRow[] {
  const rows = new Map<string, OpenCodeUsageBreakdownRow>()
  const unpricedKeys = new Set<string>()
  const dailyRows = getFilteredDaily(state, scope, range)
  const sessions = getFilteredSessions(state, scope, range)
  for (const daily of dailyRows) {
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
      estimatedCostUsd: null
    }
    existing.events += daily.eventCount
    existing.inputTokens += daily.inputTokens
    existing.cachedInputTokens += daily.cachedInputTokens
    existing.outputTokens += daily.outputTokens
    existing.reasoningOutputTokens += daily.reasoningOutputTokens
    existing.totalTokens += daily.totalTokens
    existing.estimatedCostUsd = addCost(existing.estimatedCostUsd, daily.estimatedCostUsd)
    if (daily.totalTokens > 0 && daily.estimatedCostUsd === null) {
      unpricedKeys.add(key)
    }
    rows.set(key, existing)
  }
  for (const session of sessions) {
    const keys =
      kind === 'model'
        ? session.modelBreakdown.map((entry) => entry.modelKey)
        : session.locationBreakdown.map((entry) => entry.locationKey)
    for (const key of keys) {
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

export function buildOpenCodeUsageRecentSessions(
  state: OpenCodeUsagePersistedState,
  scope: OpenCodeUsageScope,
  range: OpenCodeUsageRange,
  limit = 10
): OpenCodeUsageSessionRow[] {
  return getFilteredSessions(state, scope, range)
    .slice(0, limit)
    .map((session) => ({
      sessionId: session.sessionId,
      lastActiveAt: session.lastTimestamp,
      durationMinutes: Math.max(
        0,
        Math.round(
          (new Date(session.lastTimestamp).getTime() - new Date(session.firstTimestamp).getTime()) /
            60_000
        )
      ),
      projectLabel: session.primaryProjectLabel,
      model: session.primaryModel,
      events: session.eventCount,
      inputTokens: session.totalInputTokens,
      cachedInputTokens: session.totalCachedInputTokens,
      outputTokens: session.totalOutputTokens,
      reasoningOutputTokens: session.totalReasoningOutputTokens,
      totalTokens: session.totalTokens
    }))
}

export function buildOpenCodeUsageSnapshot(
  state: OpenCodeUsagePersistedState,
  scanState: OpenCodeUsageSnapshot['scanState'],
  scope: OpenCodeUsageScope,
  range: OpenCodeUsageRange,
  recentSessionLimit: number
): OpenCodeUsageSnapshot {
  return {
    scanState,
    summary: buildOpenCodeUsageSummary(state, scope, range),
    daily: buildOpenCodeUsageDaily(state, scope, range),
    modelBreakdown: buildOpenCodeUsageBreakdown(state, scope, range, 'model'),
    projectBreakdown: buildOpenCodeUsageBreakdown(state, scope, range, 'project'),
    recentSessions: buildOpenCodeUsageRecentSessions(state, scope, range, recentSessionLimit)
  }
}
