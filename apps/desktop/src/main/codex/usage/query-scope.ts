import type { CodexUsageRange, CodexUsageScope } from '~shared/codex-usage-types'

import type { CodexUsagePersistedState } from './types'

export type ScopedCodexUsageModelRow = {
  modelKey: string
  modelLabel: string
  hasInferredPricing: boolean
  eventCount: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export function getFilteredCodexUsageDaily(
  state: CodexUsagePersistedState,
  scope: CodexUsageScope,
  range: CodexUsageRange
): CodexUsagePersistedState['dailyAggregates'] {
  const cutoff = getRangeCutoff(range)
  return state.dailyAggregates.filter(
    (entry) => (!cutoff || entry.day >= cutoff) && !(scope === 'yiru' && entry.worktreeId === null)
  )
}

export function getFilteredCodexUsageSessions(
  state: CodexUsagePersistedState,
  scope: CodexUsageScope,
  range: CodexUsageRange
): CodexUsagePersistedState['sessions'] {
  const cutoff = getRangeCutoff(range)
  return state.sessions.filter((session) => {
    const day = getLocalDay(session.lastTimestamp)
    if (!day || (cutoff && day < cutoff)) {
      return false
    }
    return scope === 'all' || session.locationBreakdown.some((entry) => entry.worktreeId !== null)
  })
}

export function getScopedCodexSessionModels(
  session: CodexUsagePersistedState['sessions'][number],
  scope: CodexUsageScope
): ScopedCodexUsageModelRow[] {
  if (scope === 'all' || session.locationModelBreakdown.length === 0) {
    return session.modelBreakdown
  }
  const rows = new Map<string, ScopedCodexUsageModelRow>()
  for (const entry of session.locationModelBreakdown) {
    if (entry.worktreeId === null) {
      continue
    }
    const existing = rows.get(entry.modelKey) ?? {
      modelKey: entry.modelKey,
      modelLabel: entry.modelLabel,
      hasInferredPricing: false,
      eventCount: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0
    }
    existing.hasInferredPricing ||= entry.hasInferredPricing
    existing.eventCount += entry.eventCount
    existing.inputTokens += entry.inputTokens
    existing.cachedInputTokens += entry.cachedInputTokens
    existing.outputTokens += entry.outputTokens
    existing.reasoningOutputTokens += entry.reasoningOutputTokens
    existing.totalTokens += entry.totalTokens
    rows.set(entry.modelKey, existing)
  }
  return [...rows.values()].sort((left, right) => right.totalTokens - left.totalTokens)
}

export function getScopedCodexSessionPrimaryModel(
  session: CodexUsagePersistedState['sessions'][number],
  scope: CodexUsageScope
): string | null {
  const models = getScopedCodexSessionModels(session, scope)
  if (models.length === 0) {
    return session.primaryModel
  }
  return models.length === 1 ? (models[0]?.modelLabel ?? null) : 'Mixed models'
}

function getRangeCutoff(range: CodexUsageRange): string | null {
  if (range === 'all') {
    return null
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  now.setDate(now.getDate() - (days - 1))
  return formatLocalDay(now)
}

function getLocalDay(timestamp: string): string | null {
  const parsed = new Date(timestamp)
  return Number.isNaN(parsed.getTime()) ? null : formatLocalDay(parsed)
}

function formatLocalDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
