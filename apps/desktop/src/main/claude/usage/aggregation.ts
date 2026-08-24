import type {
  ClaudeUsageAttributedTurn,
  ClaudeUsageDailyAggregate,
  ClaudeUsageSession
} from './types'

export function aggregateClaudeUsage(turns: ClaudeUsageAttributedTurn[]): {
  sessions: ClaudeUsageSession[]
  dailyAggregates: ClaudeUsageDailyAggregate[]
} {
  const sessionsById = new Map<string, ClaudeUsageSession>()
  const dailyByKey = new Map<string, ClaudeUsageDailyAggregate>()
  for (const turn of turns) {
    aggregateSessionTurn(sessionsById, turn)
    aggregateDailyTurn(dailyByKey, turn)
  }
  return {
    sessions: finalizeClaudeSessions(sessionsById),
    dailyAggregates: finalizeClaudeDailyAggregates(dailyByKey)
  }
}

export function mergeClaudeSessions(
  target: Map<string, ClaudeUsageSession>,
  sessions: ClaudeUsageSession[]
): void {
  for (const session of sessions) {
    const existing = target.get(session.sessionId)
    if (!existing) {
      target.set(session.sessionId, structuredClone(session))
      continue
    }
    if (session.firstTimestamp < existing.firstTimestamp) {
      existing.firstTimestamp = session.firstTimestamp
    }
    if (session.lastTimestamp > existing.lastTimestamp) {
      existing.lastTimestamp = session.lastTimestamp
      existing.lastCwd = session.lastCwd
      existing.lastGitBranch = session.lastGitBranch
    }
    existing.model = session.model ?? existing.model
    existing.turnCount += session.turnCount
    existing.totalInputTokens += session.totalInputTokens
    existing.totalOutputTokens += session.totalOutputTokens
    existing.totalCacheReadTokens += session.totalCacheReadTokens
    existing.totalCacheWriteTokens += session.totalCacheWriteTokens
    for (const location of session.locationBreakdown) {
      const existingLocation = existing.locationBreakdown.find(
        (entry) => entry.locationKey === location.locationKey
      )
      if (existingLocation) {
        existingLocation.turnCount += location.turnCount
        existingLocation.inputTokens += location.inputTokens
        existingLocation.outputTokens += location.outputTokens
        existingLocation.cacheReadTokens += location.cacheReadTokens
        existingLocation.cacheWriteTokens += location.cacheWriteTokens
      } else {
        existing.locationBreakdown.push({ ...location })
      }
    }
  }
}

export function mergeClaudeDailyAggregates(
  target: Map<string, ClaudeUsageDailyAggregate>,
  dailyAggregates: ClaudeUsageDailyAggregate[]
): void {
  for (const aggregate of dailyAggregates) {
    const key = dailyKey(aggregate)
    const existing = target.get(key)
    if (!existing) {
      target.set(key, { ...aggregate })
      continue
    }
    existing.turnCount += aggregate.turnCount
    existing.zeroCacheReadTurnCount += aggregate.zeroCacheReadTurnCount
    existing.inputTokens += aggregate.inputTokens
    existing.outputTokens += aggregate.outputTokens
    existing.cacheReadTokens += aggregate.cacheReadTokens
    existing.cacheWriteTokens += aggregate.cacheWriteTokens
    existing.estimatedCostUsd = addKnownCost(existing.estimatedCostUsd, aggregate.estimatedCostUsd)
    existing.unpricedTokens += aggregate.unpricedTokens
  }
}

export function finalizeClaudeSessions(
  sessionsById: Map<string, ClaudeUsageSession>
): ClaudeUsageSession[] {
  for (const session of sessionsById.values()) {
    session.locationBreakdown.sort(
      (left, right) => right.inputTokens + right.outputTokens - left.inputTokens - left.outputTokens
    )
    const primaryLocation = session.locationBreakdown[0]
    if (primaryLocation) {
      session.primaryRepoId = primaryLocation.repoId
      session.primaryWorktreeId = primaryLocation.worktreeId
    }
  }
  return [...sessionsById.values()].sort((left, right) =>
    right.lastTimestamp.localeCompare(left.lastTimestamp)
  )
}

export function finalizeClaudeDailyAggregates(
  dailyByKey: Map<string, ClaudeUsageDailyAggregate>
): ClaudeUsageDailyAggregate[] {
  return [...dailyByKey.values()].sort((left, right) =>
    left.day === right.day
      ? left.projectLabel.localeCompare(right.projectLabel)
      : left.day.localeCompare(right.day)
  )
}

function aggregateSessionTurn(
  sessionsById: Map<string, ClaudeUsageSession>,
  turn: ClaudeUsageAttributedTurn
): void {
  let session = sessionsById.get(turn.sessionId)
  if (!session) {
    session = {
      sessionId: turn.sessionId,
      firstTimestamp: turn.timestamp,
      lastTimestamp: turn.timestamp,
      model: turn.model,
      lastCwd: turn.cwd,
      lastGitBranch: turn.gitBranch,
      primaryWorktreeId: turn.worktreeId,
      primaryRepoId: turn.repoId,
      turnCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      locationBreakdown: []
    }
    sessionsById.set(turn.sessionId, session)
  }
  if (turn.timestamp < session.firstTimestamp) {
    session.firstTimestamp = turn.timestamp
  }
  if (turn.timestamp > session.lastTimestamp) {
    session.lastTimestamp = turn.timestamp
    session.lastCwd = turn.cwd
    session.lastGitBranch = turn.gitBranch
  }
  session.model = turn.model ?? session.model
  session.turnCount++
  session.totalInputTokens += turn.inputTokens
  session.totalOutputTokens += turn.outputTokens
  session.totalCacheReadTokens += turn.cacheReadTokens
  session.totalCacheWriteTokens += turn.cacheWriteTokens
  const location = session.locationBreakdown.find((entry) => entry.locationKey === turn.projectKey)
  if (location) {
    location.turnCount++
    location.inputTokens += turn.inputTokens
    location.outputTokens += turn.outputTokens
    location.cacheReadTokens += turn.cacheReadTokens
    location.cacheWriteTokens += turn.cacheWriteTokens
  } else {
    session.locationBreakdown.push({
      locationKey: turn.projectKey,
      projectLabel: turn.projectLabel,
      repoId: turn.repoId,
      worktreeId: turn.worktreeId,
      turnCount: 1,
      inputTokens: turn.inputTokens,
      outputTokens: turn.outputTokens,
      cacheReadTokens: turn.cacheReadTokens,
      cacheWriteTokens: turn.cacheWriteTokens
    })
  }
}

function aggregateDailyTurn(
  dailyByKey: Map<string, ClaudeUsageDailyAggregate>,
  turn: ClaudeUsageAttributedTurn
): void {
  const key = dailyKey(turn)
  const existing = dailyByKey.get(key)
  if (existing) {
    existing.turnCount++
    existing.zeroCacheReadTurnCount += turn.cacheReadTokens === 0 ? 1 : 0
    existing.inputTokens += turn.inputTokens
    existing.outputTokens += turn.outputTokens
    existing.cacheReadTokens += turn.cacheReadTokens
    existing.cacheWriteTokens += turn.cacheWriteTokens
    existing.estimatedCostUsd = addKnownCost(existing.estimatedCostUsd, turn.estimatedCostUsd)
    existing.unpricedTokens += turn.unpricedTokens
    return
  }
  dailyByKey.set(key, {
    day: turn.day,
    model: turn.model,
    projectKey: turn.projectKey,
    projectLabel: turn.projectLabel,
    repoId: turn.repoId,
    worktreeId: turn.worktreeId,
    turnCount: 1,
    zeroCacheReadTurnCount: turn.cacheReadTokens === 0 ? 1 : 0,
    inputTokens: turn.inputTokens,
    outputTokens: turn.outputTokens,
    cacheReadTokens: turn.cacheReadTokens,
    cacheWriteTokens: turn.cacheWriteTokens,
    estimatedCostUsd: turn.estimatedCostUsd,
    unpricedTokens: turn.unpricedTokens
  })
}

function dailyKey(value: { day: string; model: string | null; projectKey: string }): string {
  return [value.day, value.model ?? 'unknown', value.projectKey].join('::')
}

function addKnownCost(left: number | null, right: number | null): number | null {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0)
}
