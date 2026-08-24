import { finalizeOpenCodeUsageSessions, mergeOpenCodeUsageCost } from './scanner-aggregation'
import type { OpenCodeUsageDailyAggregate, OpenCodeUsageSession } from './types'

export function mergeOpenCodeUsageSessions(
  target: Map<string, OpenCodeUsageSession>,
  sessions: OpenCodeUsageSession[]
): void {
  for (const session of sessions) {
    const existing = target.get(session.sessionId)
    if (!existing) {
      target.set(session.sessionId, structuredClone(session))
      continue
    }
    existing.firstTimestamp =
      session.firstTimestamp < existing.firstTimestamp
        ? session.firstTimestamp
        : existing.firstTimestamp
    existing.lastTimestamp =
      session.lastTimestamp > existing.lastTimestamp
        ? session.lastTimestamp
        : existing.lastTimestamp
    const previousTokens = existing.totalTokens
    existing.eventCount += session.eventCount
    existing.totalInputTokens += session.totalInputTokens
    existing.totalCachedInputTokens += session.totalCachedInputTokens
    existing.totalOutputTokens += session.totalOutputTokens
    existing.totalReasoningOutputTokens += session.totalReasoningOutputTokens
    existing.totalTokens += session.totalTokens
    existing.estimatedCostUsd = mergeOpenCodeUsageCost(
      existing.estimatedCostUsd,
      session.estimatedCostUsd,
      previousTokens,
      session.totalTokens
    )
    mergeBreakdowns(existing, session)
  }
}

function mergeBreakdowns(existing: OpenCodeUsageSession, session: OpenCodeUsageSession): void {
  for (const location of session.locationBreakdown) {
    const target = existing.locationBreakdown.find(
      (entry) => entry.locationKey === location.locationKey
    )
    if (!target) {
      existing.locationBreakdown.push({ ...location })
      continue
    }
    const previousTokens = target.totalTokens
    target.eventCount += location.eventCount
    target.inputTokens += location.inputTokens
    target.cachedInputTokens += location.cachedInputTokens
    target.outputTokens += location.outputTokens
    target.reasoningOutputTokens += location.reasoningOutputTokens
    target.totalTokens += location.totalTokens
    target.estimatedCostUsd = mergeOpenCodeUsageCost(
      target.estimatedCostUsd,
      location.estimatedCostUsd,
      previousTokens,
      location.totalTokens
    )
  }
  for (const model of session.modelBreakdown) {
    const target = existing.modelBreakdown.find((entry) => entry.modelKey === model.modelKey)
    if (!target) {
      existing.modelBreakdown.push({ ...model })
      continue
    }
    const previousTokens = target.totalTokens
    target.eventCount += model.eventCount
    target.inputTokens += model.inputTokens
    target.cachedInputTokens += model.cachedInputTokens
    target.outputTokens += model.outputTokens
    target.reasoningOutputTokens += model.reasoningOutputTokens
    target.totalTokens += model.totalTokens
    target.estimatedCostUsd = mergeOpenCodeUsageCost(
      target.estimatedCostUsd,
      model.estimatedCostUsd,
      previousTokens,
      model.totalTokens
    )
  }
  for (const locationModel of session.locationModelBreakdown) {
    const target = existing.locationModelBreakdown.find(
      (entry) =>
        entry.locationKey === locationModel.locationKey && entry.modelKey === locationModel.modelKey
    )
    if (!target) {
      existing.locationModelBreakdown.push({ ...locationModel })
      continue
    }
    const previousTokens = target.totalTokens
    target.eventCount += locationModel.eventCount
    target.inputTokens += locationModel.inputTokens
    target.cachedInputTokens += locationModel.cachedInputTokens
    target.outputTokens += locationModel.outputTokens
    target.reasoningOutputTokens += locationModel.reasoningOutputTokens
    target.totalTokens += locationModel.totalTokens
    target.estimatedCostUsd = mergeOpenCodeUsageCost(
      target.estimatedCostUsd,
      locationModel.estimatedCostUsd,
      previousTokens,
      locationModel.totalTokens
    )
  }
}

export function mergeOpenCodeUsageDailyAggregates(
  target: Map<string, OpenCodeUsageDailyAggregate>,
  dailyAggregates: OpenCodeUsageDailyAggregate[]
): void {
  for (const aggregate of dailyAggregates) {
    const key = [aggregate.day, aggregate.model ?? 'unknown', aggregate.projectKey].join('::')
    const existing = target.get(key)
    if (!existing) {
      target.set(key, { ...aggregate })
      continue
    }
    const previousTokens = existing.totalTokens
    existing.eventCount += aggregate.eventCount
    existing.inputTokens += aggregate.inputTokens
    existing.cachedInputTokens += aggregate.cachedInputTokens
    existing.outputTokens += aggregate.outputTokens
    existing.reasoningOutputTokens += aggregate.reasoningOutputTokens
    existing.totalTokens += aggregate.totalTokens
    existing.estimatedCostUsd = mergeOpenCodeUsageCost(
      existing.estimatedCostUsd,
      aggregate.estimatedCostUsd,
      previousTokens,
      aggregate.totalTokens
    )
  }
}

export function finalizeOpenCodeUsageProjection(
  sessionsById: Map<string, OpenCodeUsageSession>,
  dailyByKey: Map<string, OpenCodeUsageDailyAggregate>
): { sessions: OpenCodeUsageSession[]; dailyAggregates: OpenCodeUsageDailyAggregate[] } {
  return {
    sessions: finalizeOpenCodeUsageSessions(sessionsById),
    dailyAggregates: [...dailyByKey.values()].sort((left, right) =>
      left.day === right.day
        ? left.projectLabel.localeCompare(right.projectLabel)
        : left.day.localeCompare(right.day)
    )
  }
}
