import type {
  OpenCodeUsageAttributedEvent,
  OpenCodeUsageDailyAggregate,
  OpenCodeUsageLocationBreakdown,
  OpenCodeUsageLocationModelBreakdown,
  OpenCodeUsageModelBreakdown,
  OpenCodeUsageSession
} from './types'

export function mergeOpenCodeUsageCost(
  left: number | null,
  right: number | null,
  leftTokens: number,
  rightTokens: number
): number | null {
  // Why: null means at least one token-bearing request has no comparable price.
  if ((leftTokens > 0 && left === null) || (rightTokens > 0 && right === null)) {
    return null
  }
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0)
}

function createEmptySession(event: OpenCodeUsageAttributedEvent): OpenCodeUsageSession {
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
    estimatedCostUsd: null,
    locationBreakdown: [],
    modelBreakdown: [],
    locationModelBreakdown: []
  }
}

function createEmptyDailyAggregate(
  event: OpenCodeUsageAttributedEvent
): OpenCodeUsageDailyAggregate {
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
    estimatedCostUsd: null
  }
}

function mergeLocationBreakdown(
  target: OpenCodeUsageLocationBreakdown[],
  event: OpenCodeUsageAttributedEvent
): void {
  const existing = target.find((entry) => entry.locationKey === event.projectKey)
  if (!existing) {
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
      estimatedCostUsd: event.estimatedCostUsd
    })
    return
  }
  const previousTokens = existing.totalTokens
  existing.eventCount++
  existing.inputTokens += event.inputTokens
  existing.cachedInputTokens += event.cachedInputTokens
  existing.outputTokens += event.outputTokens
  existing.reasoningOutputTokens += event.reasoningOutputTokens
  existing.totalTokens += event.totalTokens
  existing.estimatedCostUsd = mergeOpenCodeUsageCost(
    existing.estimatedCostUsd,
    event.estimatedCostUsd,
    previousTokens,
    event.totalTokens
  )
}

function mergeModelBreakdown(
  target: OpenCodeUsageModelBreakdown[],
  event: OpenCodeUsageAttributedEvent
): void {
  const modelKey = event.model ?? 'unknown'
  const existing = target.find((entry) => entry.modelKey === modelKey)
  if (!existing) {
    target.push({
      modelKey,
      modelLabel: event.model ?? 'Unknown model',
      eventCount: 1,
      inputTokens: event.inputTokens,
      cachedInputTokens: event.cachedInputTokens,
      outputTokens: event.outputTokens,
      reasoningOutputTokens: event.reasoningOutputTokens,
      totalTokens: event.totalTokens,
      estimatedCostUsd: event.estimatedCostUsd
    })
    return
  }
  const previousTokens = existing.totalTokens
  existing.eventCount++
  existing.inputTokens += event.inputTokens
  existing.cachedInputTokens += event.cachedInputTokens
  existing.outputTokens += event.outputTokens
  existing.reasoningOutputTokens += event.reasoningOutputTokens
  existing.totalTokens += event.totalTokens
  existing.estimatedCostUsd = mergeOpenCodeUsageCost(
    existing.estimatedCostUsd,
    event.estimatedCostUsd,
    previousTokens,
    event.totalTokens
  )
}

function mergeLocationModelBreakdown(
  target: OpenCodeUsageLocationModelBreakdown[],
  event: OpenCodeUsageAttributedEvent
): void {
  const modelKey = event.model ?? 'unknown'
  const existing = target.find(
    (entry) => entry.locationKey === event.projectKey && entry.modelKey === modelKey
  )
  if (!existing) {
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
      estimatedCostUsd: event.estimatedCostUsd
    })
    return
  }
  const previousTokens = existing.totalTokens
  existing.eventCount++
  existing.inputTokens += event.inputTokens
  existing.cachedInputTokens += event.cachedInputTokens
  existing.outputTokens += event.outputTokens
  existing.reasoningOutputTokens += event.reasoningOutputTokens
  existing.totalTokens += event.totalTokens
  existing.estimatedCostUsd = mergeOpenCodeUsageCost(
    existing.estimatedCostUsd,
    event.estimatedCostUsd,
    previousTokens,
    event.totalTokens
  )
}

export function finalizeOpenCodeUsageSessions(
  sessionsById: Map<string, OpenCodeUsageSession>
): OpenCodeUsageSession[] {
  for (const session of sessionsById.values()) {
    session.locationBreakdown.sort((left, right) => right.totalTokens - left.totalTokens)
    session.modelBreakdown.sort((left, right) => right.totalTokens - left.totalTokens)
    const primaryLocation = session.locationBreakdown[0]
    const primaryModel = session.modelBreakdown[0]
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

export function aggregateOpenCodeUsage(events: OpenCodeUsageAttributedEvent[]): {
  sessions: OpenCodeUsageSession[]
  dailyAggregates: OpenCodeUsageDailyAggregate[]
} {
  const sessionsById = new Map<string, OpenCodeUsageSession>()
  const dailyByKey = new Map<string, OpenCodeUsageDailyAggregate>()
  for (const event of events) {
    const session = sessionsById.get(event.sessionId) ?? createEmptySession(event)
    sessionsById.set(event.sessionId, session)
    session.firstTimestamp =
      event.timestamp < session.firstTimestamp ? event.timestamp : session.firstTimestamp
    session.lastTimestamp =
      event.timestamp >= session.lastTimestamp ? event.timestamp : session.lastTimestamp
    const previousSessionTokens = session.totalTokens
    session.eventCount++
    session.totalInputTokens += event.inputTokens
    session.totalCachedInputTokens += event.cachedInputTokens
    session.totalOutputTokens += event.outputTokens
    session.totalReasoningOutputTokens += event.reasoningOutputTokens
    session.totalTokens += event.totalTokens
    session.estimatedCostUsd = mergeOpenCodeUsageCost(
      session.estimatedCostUsd,
      event.estimatedCostUsd,
      previousSessionTokens,
      event.totalTokens
    )
    mergeLocationBreakdown(session.locationBreakdown, event)
    mergeModelBreakdown(session.modelBreakdown, event)
    mergeLocationModelBreakdown(session.locationModelBreakdown, event)
    const dailyKey = [event.day, event.model ?? 'unknown', event.projectKey].join('::')
    const daily = dailyByKey.get(dailyKey) ?? createEmptyDailyAggregate(event)
    dailyByKey.set(dailyKey, daily)
    const previousDailyTokens = daily.totalTokens
    daily.eventCount++
    daily.inputTokens += event.inputTokens
    daily.cachedInputTokens += event.cachedInputTokens
    daily.outputTokens += event.outputTokens
    daily.reasoningOutputTokens += event.reasoningOutputTokens
    daily.totalTokens += event.totalTokens
    daily.estimatedCostUsd = mergeOpenCodeUsageCost(
      daily.estimatedCostUsd,
      event.estimatedCostUsd,
      previousDailyTokens,
      event.totalTokens
    )
  }
  return {
    sessions: finalizeOpenCodeUsageSessions(sessionsById),
    dailyAggregates: [...dailyByKey.values()].sort((left, right) =>
      left.day === right.day
        ? left.projectLabel.localeCompare(right.projectLabel)
        : left.day.localeCompare(right.day)
    )
  }
}
