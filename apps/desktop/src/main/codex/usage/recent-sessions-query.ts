import type {
  CodexUsageRange,
  CodexUsageScope,
  CodexUsageSessionRow
} from '~shared/codex-usage-types'

import { getFilteredCodexUsageSessions, getScopedCodexSessionPrimaryModel } from './query-scope'
import type { CodexUsagePersistedState } from './types'

export function buildRecentCodexUsageSessions(
  state: CodexUsagePersistedState,
  scope: CodexUsageScope,
  range: CodexUsageRange,
  limit = 12
): CodexUsageSessionRow[] {
  return getFilteredCodexUsageSessions(state, scope, range)
    .slice(0, limit)
    .map((session) => {
      const matchingLocations = session.locationBreakdown.filter(
        (entry) => scope === 'all' || entry.worktreeId !== null
      )
      const locations = matchingLocations.length > 0 ? matchingLocations : session.locationBreakdown
      const totals = locations.reduce(
        (aggregate, entry) => {
          aggregate.events += entry.eventCount
          aggregate.inputTokens += entry.inputTokens
          aggregate.cachedInputTokens += entry.cachedInputTokens
          aggregate.outputTokens += entry.outputTokens
          aggregate.reasoningOutputTokens += entry.reasoningOutputTokens
          aggregate.totalTokens += entry.totalTokens
          aggregate.hasInferredPricing ||= entry.hasInferredPricing
          return aggregate
        },
        {
          events: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 0,
          hasInferredPricing: false
        }
      )
      return {
        sessionId: session.sessionId,
        lastActiveAt: session.lastTimestamp,
        durationMinutes: Math.max(
          0,
          Math.round(
            (new Date(session.lastTimestamp).getTime() -
              new Date(session.firstTimestamp).getTime()) /
              60_000
          )
        ),
        projectLabel:
          locations.length > 1
            ? 'Multiple locations'
            : (locations[0]?.projectLabel ?? session.primaryProjectLabel),
        model: getScopedCodexSessionPrimaryModel(session, scope),
        events: totals.events,
        inputTokens: totals.inputTokens,
        cachedInputTokens: totals.cachedInputTokens,
        outputTokens: totals.outputTokens,
        reasoningOutputTokens: totals.reasoningOutputTokens,
        totalTokens: totals.totalTokens,
        hasInferredPricing: session.hasInferredPricing || totals.hasInferredPricing
      }
    })
}
