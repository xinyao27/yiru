import type { AiVaultAgent, AiVaultSession } from '@yiru/workbench-model/agent'

import type { StatsSummary } from '../../shared/types'
import { listAiVaultSessions } from '../ai-vault/cached-session-list'
import type { StatsCollector } from './collector'

const STATS_AI_VAULT_SESSION_LIMIT = Number.MAX_SAFE_INTEGER
const TOKEN_UNAVAILABLE_AGENTS = [
  'antigravity',
  'cursor',
  'hermes',
  'rovo'
] as const satisfies readonly AiVaultAgent[]

export async function buildStatsSummary(stats: StatsCollector): Promise<StatsSummary> {
  const activitySummary = stats.getSummary()
  try {
    const result = await listAiVaultSessions({
      limit: STATS_AI_VAULT_SESSION_LIMIT,
      limitPerAgent: STATS_AI_VAULT_SESSION_LIMIT
    })
    return {
      ...activitySummary,
      dailyTokens: aggregateDailyTokens(result.sessions),
      modelTokens: aggregateModelTokens(result.sessions),
      tokenDataAvailable: true,
      tokenUnavailableAgents: [...TOKEN_UNAVAILABLE_AGENTS]
    }
  } catch (error) {
    console.error('[stats] Failed to scan token activity:', error)
    return {
      ...activitySummary,
      dailyTokens: [],
      modelTokens: [],
      tokenDataAvailable: false,
      tokenUnavailableAgents: [...TOKEN_UNAVAILABLE_AGENTS]
    }
  }
}

function aggregateModelTokens(
  sessions: AiVaultSession[]
): NonNullable<StatsSummary['modelTokens']> {
  const byModel = new Map<string, number>()
  for (const session of sessions) {
    const model = session.model?.trim()
    if (!model || model === '<synthetic>') {
      continue
    }
    byModel.set(model, (byModel.get(model) ?? 0) + session.totalTokens)
  }
  return [...byModel.entries()]
    .map(([model, tokens]) => ({ model, tokens }))
    .sort((left, right) => right.tokens - left.tokens)
}

function aggregateDailyTokens(
  sessions: AiVaultSession[]
): NonNullable<StatsSummary['dailyTokens']> {
  const byDay = new Map<string, number>()
  for (const session of sessions) {
    for (const entry of session.tokensByDay ?? []) {
      byDay.set(entry.day, (byDay.get(entry.day) ?? 0) + entry.tokens)
    }
  }
  return [...byDay.entries()]
    .map(([day, tokens]) => ({ day, tokens }))
    .sort((left, right) => left.day.localeCompare(right.day))
}
