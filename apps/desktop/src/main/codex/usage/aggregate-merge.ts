import type { CodexUsageDailyAggregate, CodexUsageSession } from './types'

export function mergeSessions(
  target: Map<string, CodexUsageSession>,
  sessions: CodexUsageSession[]
): void {
  for (const session of sessions) {
    const existing = target.get(session.sessionId)
    if (!existing) {
      target.set(session.sessionId, cloneSessionForMerge(session))
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
    existing.eventCount += session.eventCount
    existing.totalInputTokens += session.totalInputTokens
    existing.totalCachedInputTokens += session.totalCachedInputTokens
    existing.totalOutputTokens += session.totalOutputTokens
    existing.totalReasoningOutputTokens += session.totalReasoningOutputTokens
    existing.totalTokens += session.totalTokens
    existing.hasInferredPricing ||= session.hasInferredPricing

    for (const location of session.locationBreakdown) {
      const existingLocation =
        existing.locationBreakdown.find((entry) => entry.locationKey === location.locationKey) ??
        null
      if (existingLocation) {
        existingLocation.eventCount += location.eventCount
        existingLocation.inputTokens += location.inputTokens
        existingLocation.cachedInputTokens += location.cachedInputTokens
        existingLocation.outputTokens += location.outputTokens
        existingLocation.reasoningOutputTokens += location.reasoningOutputTokens
        existingLocation.totalTokens += location.totalTokens
        existingLocation.hasInferredPricing ||= location.hasInferredPricing
      } else {
        existing.locationBreakdown.push({ ...location })
      }
    }

    for (const model of session.modelBreakdown) {
      const existingModel =
        existing.modelBreakdown.find((entry) => entry.modelKey === model.modelKey) ?? null
      if (existingModel) {
        existingModel.eventCount += model.eventCount
        existingModel.inputTokens += model.inputTokens
        existingModel.cachedInputTokens += model.cachedInputTokens
        existingModel.outputTokens += model.outputTokens
        existingModel.reasoningOutputTokens += model.reasoningOutputTokens
        existingModel.totalTokens += model.totalTokens
        existingModel.hasInferredPricing ||= model.hasInferredPricing
      } else {
        existing.modelBreakdown.push({ ...model })
      }
    }

    for (const locationModel of session.locationModelBreakdown) {
      const existingLocationModel =
        existing.locationModelBreakdown.find(
          (entry) =>
            entry.locationKey === locationModel.locationKey &&
            entry.modelKey === locationModel.modelKey
        ) ?? null
      if (existingLocationModel) {
        existingLocationModel.eventCount += locationModel.eventCount
        existingLocationModel.inputTokens += locationModel.inputTokens
        existingLocationModel.cachedInputTokens += locationModel.cachedInputTokens
        existingLocationModel.outputTokens += locationModel.outputTokens
        existingLocationModel.reasoningOutputTokens += locationModel.reasoningOutputTokens
        existingLocationModel.totalTokens += locationModel.totalTokens
        existingLocationModel.hasInferredPricing ||= locationModel.hasInferredPricing
      } else {
        existing.locationModelBreakdown.push({ ...locationModel })
      }
    }
  }
}

function cloneSessionForMerge(session: CodexUsageSession): CodexUsageSession {
  return {
    ...session,
    locationBreakdown: session.locationBreakdown.map((entry) => ({ ...entry })),
    modelBreakdown: session.modelBreakdown.map((entry) => ({ ...entry })),
    locationModelBreakdown: session.locationModelBreakdown.map((entry) => ({ ...entry }))
  }
}

export function mergeDailyAggregates(
  target: Map<string, CodexUsageDailyAggregate>,
  dailyAggregates: CodexUsageDailyAggregate[]
): void {
  for (const aggregate of dailyAggregates) {
    const key = [aggregate.day, aggregate.model ?? 'unknown', aggregate.projectKey].join('::')
    const existing = target.get(key)
    if (!existing) {
      target.set(key, { ...aggregate })
      continue
    }
    existing.eventCount += aggregate.eventCount
    existing.inputTokens += aggregate.inputTokens
    existing.cachedInputTokens += aggregate.cachedInputTokens
    existing.outputTokens += aggregate.outputTokens
    existing.reasoningOutputTokens += aggregate.reasoningOutputTokens
    existing.totalTokens += aggregate.totalTokens
    existing.hasInferredPricing ||= aggregate.hasInferredPricing
    existing.estimatedCostUsd = addKnownCost(existing.estimatedCostUsd, aggregate.estimatedCostUsd)
    existing.unpricedTokens += aggregate.unpricedTokens
  }
}

function addKnownCost(left: number | null, right: number | null): number | null {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0)
}
