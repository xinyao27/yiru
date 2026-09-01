import { priceCodexUsage } from './pricing'
import type { CodexPrioritySnapshot } from './priority'
import type {
  CodexUsageAttributedEvent,
  CodexUsageDailyAggregate,
  CodexUsageLocationBreakdown,
  CodexUsageLocationModelBreakdown,
  CodexUsageModelBreakdown,
  CodexUsageSession
} from './types'

function createEmptySession(event: CodexUsageAttributedEvent): CodexUsageSession {
  return {
    sessionId: event.sessionId,
    firstTimestamp: event.timestamp,
    lastTimestamp: event.timestamp,
    primaryModel: event.model,
    hasMixedModels: false,
    primaryProjectLabel: event.projectLabel,
    hasMixedLocations: false,
    primaryWorktreeId: event.worktreeId,
    primaryRepoId: event.repoId,
    eventCount: 0,
    totalInputTokens: 0,
    totalCachedInputTokens: 0,
    totalOutputTokens: 0,
    totalReasoningOutputTokens: 0,
    totalTokens: 0,
    hasInferredPricing: false,
    locationBreakdown: [],
    modelBreakdown: [],
    locationModelBreakdown: []
  }
}

function createEmptyDailyAggregate(event: CodexUsageAttributedEvent): CodexUsageDailyAggregate {
  return {
    day: event.day,
    model: event.model,
    projectKey: event.projectKey,
    projectLabel: event.projectLabel,
    repoId: event.repoId,
    worktreeId: event.worktreeId,
    eventCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    hasInferredPricing: false,
    estimatedCostUsd: null,
    unpricedTokens: 0
  }
}

function mergeLocationBreakdown(
  target: CodexUsageLocationBreakdown[],
  event: CodexUsageAttributedEvent
): void {
  const existing = target.find((entry) => entry.locationKey === event.projectKey) ?? null
  if (existing) {
    existing.eventCount++
    existing.inputTokens += event.inputTokens
    existing.cachedInputTokens += event.cachedInputTokens
    existing.outputTokens += event.outputTokens
    existing.reasoningOutputTokens += event.reasoningOutputTokens
    existing.totalTokens += event.totalTokens
    existing.hasInferredPricing ||= event.hasInferredPricing
    return
  }

  target.push({
    locationKey: event.projectKey,
    projectLabel: event.projectLabel,
    repoId: event.repoId,
    worktreeId: event.worktreeId,
    eventCount: 1,
    inputTokens: event.inputTokens,
    cachedInputTokens: event.cachedInputTokens,
    outputTokens: event.outputTokens,
    reasoningOutputTokens: event.reasoningOutputTokens,
    totalTokens: event.totalTokens,
    hasInferredPricing: event.hasInferredPricing
  })
}

function mergeModelBreakdown(
  target: CodexUsageModelBreakdown[],
  event: CodexUsageAttributedEvent
): void {
  const key = event.model ?? 'unknown'
  const existing = target.find((entry) => entry.modelKey === key) ?? null
  if (existing) {
    existing.eventCount++
    existing.inputTokens += event.inputTokens
    existing.cachedInputTokens += event.cachedInputTokens
    existing.outputTokens += event.outputTokens
    existing.reasoningOutputTokens += event.reasoningOutputTokens
    existing.totalTokens += event.totalTokens
    existing.hasInferredPricing ||= event.hasInferredPricing
    return
  }

  target.push({
    modelKey: key,
    modelLabel: event.model ?? 'Unknown model',
    eventCount: 1,
    inputTokens: event.inputTokens,
    cachedInputTokens: event.cachedInputTokens,
    outputTokens: event.outputTokens,
    reasoningOutputTokens: event.reasoningOutputTokens,
    totalTokens: event.totalTokens,
    hasInferredPricing: event.hasInferredPricing
  })
}

function mergeLocationModelBreakdown(
  target: CodexUsageLocationModelBreakdown[],
  event: CodexUsageAttributedEvent
): void {
  const modelKey = event.model ?? 'unknown'
  const existing =
    target.find((entry) => entry.locationKey === event.projectKey && entry.modelKey === modelKey) ??
    null
  if (existing) {
    existing.eventCount++
    existing.inputTokens += event.inputTokens
    existing.cachedInputTokens += event.cachedInputTokens
    existing.outputTokens += event.outputTokens
    existing.reasoningOutputTokens += event.reasoningOutputTokens
    existing.totalTokens += event.totalTokens
    existing.hasInferredPricing ||= event.hasInferredPricing
    return
  }

  target.push({
    locationKey: event.projectKey,
    modelKey,
    modelLabel: event.model ?? 'Unknown model',
    repoId: event.repoId,
    worktreeId: event.worktreeId,
    eventCount: 1,
    inputTokens: event.inputTokens,
    cachedInputTokens: event.cachedInputTokens,
    outputTokens: event.outputTokens,
    reasoningOutputTokens: event.reasoningOutputTokens,
    totalTokens: event.totalTokens,
    hasInferredPricing: event.hasInferredPricing
  })
}

export function aggregateCodexUsage(
  events: CodexUsageAttributedEvent[],
  prioritySnapshot: CodexPrioritySnapshot
): {
  sessions: CodexUsageSession[]
  dailyAggregates: CodexUsageDailyAggregate[]
} {
  const sessionsById = new Map<string, CodexUsageSession>()
  const dailyByKey = new Map<string, CodexUsageDailyAggregate>()

  for (const event of events) {
    const session = sessionsById.get(event.sessionId) ?? createEmptySession(event)
    if (!sessionsById.has(event.sessionId)) {
      sessionsById.set(event.sessionId, session)
    }
    if (event.timestamp < session.firstTimestamp) {
      session.firstTimestamp = event.timestamp
    }
    if (event.timestamp >= session.lastTimestamp) {
      session.lastTimestamp = event.timestamp
    }
    session.eventCount++
    session.totalInputTokens += event.inputTokens
    session.totalCachedInputTokens += event.cachedInputTokens
    session.totalOutputTokens += event.outputTokens
    session.totalReasoningOutputTokens += event.reasoningOutputTokens
    session.totalTokens += event.totalTokens
    session.hasInferredPricing ||= event.hasInferredPricing
    mergeLocationBreakdown(session.locationBreakdown, event)
    mergeModelBreakdown(session.modelBreakdown, event)
    mergeLocationModelBreakdown(session.locationModelBreakdown, event)

    const dailyKey = [event.day, event.model ?? 'unknown', event.projectKey].join('::')
    const daily = dailyByKey.get(dailyKey) ?? createEmptyDailyAggregate(event)
    if (!dailyByKey.has(dailyKey)) {
      dailyByKey.set(dailyKey, daily)
    }
    daily.eventCount++
    daily.inputTokens += event.inputTokens
    daily.cachedInputTokens += event.cachedInputTokens
    daily.outputTokens += event.outputTokens
    daily.reasoningOutputTokens += event.reasoningOutputTokens
    daily.totalTokens += event.totalTokens
    daily.hasInferredPricing ||= event.hasInferredPricing
    const priorityModel = event.turnId
      ? prioritySnapshot.modelsByTurnId.get(event.turnId)
      : undefined
    const pricingModel = priorityModel ?? event.model
    const estimatedCostUsd =
      event.hasInferredPricing && pricingModel === null
        ? null
        : priceCodexUsage(
            pricingModel,
            event.inputTokens,
            event.cachedInputTokens,
            event.cacheWriteTokens,
            event.outputTokens,
            priorityModel !== undefined ? { isPriority: true, priorityModel } : undefined
          )
    daily.estimatedCostUsd = addKnownCost(daily.estimatedCostUsd, estimatedCostUsd)
    if (estimatedCostUsd === null) {
      daily.unpricedTokens += event.totalTokens
    }
  }

  return {
    sessions: finalizeSessions(sessionsById),
    dailyAggregates: [...dailyByKey.values()].sort((left, right) =>
      left.day === right.day
        ? left.projectLabel.localeCompare(right.projectLabel)
        : left.day.localeCompare(right.day)
    )
  }
}

export function finalizeSessions(
  sessionsById: Map<string, CodexUsageSession>
): CodexUsageSession[] {
  for (const session of sessionsById.values()) {
    session.locationBreakdown.sort((left, right) => right.totalTokens - left.totalTokens)
    session.modelBreakdown.sort((left, right) => right.totalTokens - left.totalTokens)
    const primaryLocation = session.locationBreakdown[0] ?? null
    const primaryModel = session.modelBreakdown[0] ?? null
    session.primaryProjectLabel =
      session.locationBreakdown.length <= 1
        ? (primaryLocation?.projectLabel ?? 'Unknown location')
        : 'Multiple locations'
    session.hasMixedLocations = session.locationBreakdown.length > 1
    session.primaryWorktreeId = primaryLocation?.worktreeId ?? null
    session.primaryRepoId = primaryLocation?.repoId ?? null
    session.primaryModel =
      session.modelBreakdown.length <= 1 ? (primaryModel?.modelLabel ?? null) : 'Mixed models'
    session.hasMixedModels = session.modelBreakdown.length > 1
  }

  return [...sessionsById.values()].sort((left, right) =>
    right.lastTimestamp.localeCompare(left.lastTimestamp)
  )
}

function addKnownCost(left: number | null, right: number | null): number | null {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0)
}
