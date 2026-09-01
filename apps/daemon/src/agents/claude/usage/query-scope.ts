import type {
  ClaudeUsageRange,
  ClaudeUsageScope
} from '@yiru/runtime-protocol/workbench/claude-usage-types'

import type { ClaudeUsagePersistedState } from './types'

export function addKnownClaudeCost(left: number | null, right: number | null): number | null {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0)
}

function getRangeCutoff(range: ClaudeUsageRange): string | null {
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

export function getFilteredClaudeUsageDaily(
  state: ClaudeUsagePersistedState,
  scope: ClaudeUsageScope,
  range: ClaudeUsageRange
): ClaudeUsagePersistedState['dailyAggregates'] {
  const cutoff = getRangeCutoff(range)
  return state.dailyAggregates.filter(
    (entry) => (!cutoff || entry.day >= cutoff) && (scope !== 'yiru' || entry.worktreeId !== null)
  )
}

export function getFilteredClaudeUsageSessions(
  state: ClaudeUsagePersistedState,
  scope: ClaudeUsageScope,
  range: ClaudeUsageRange
): ClaudeUsagePersistedState['sessions'] {
  const cutoff = getRangeCutoff(range)
  return state.sessions.filter((session) => {
    // Why: daily aggregates use local calendar days; session counts must use
    // the same conversion around UTC boundaries.
    const day = getLocalDay(session.lastTimestamp)
    if (!day || (cutoff && day < cutoff)) {
      return false
    }
    return scope !== 'yiru' || session.locationBreakdown.some((entry) => entry.worktreeId !== null)
  })
}
