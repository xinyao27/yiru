import type { AiVaultAgent, AiVaultSession } from '@yiru/workbench-model/agent'
import { buildUsageValueSnapshot } from '~shared/stats/usage-value'
import type { StatsSummary } from '~shared/types'

import { listAiVaultSessions } from '../ai-vault/cached-session-list'
import type { ClaudeUsageStore } from '../claude/usage/store'
import type { CodexUsageStore } from '../codex/usage/store'
import type { OpenCodeUsageStore } from '../opencode/usage/store'
import type { StatsCollector } from './collector'

const STATS_AI_VAULT_SESSION_LIMIT = Number.MAX_SAFE_INTEGER
const TOKEN_UNAVAILABLE_AGENTS = [
  'antigravity',
  'cursor',
  'hermes',
  'rovo'
] as const satisfies readonly AiVaultAgent[]

export type StatsUsageStores = {
  claude: ClaudeUsageStore
  codex: CodexUsageStore
  openCode: OpenCodeUsageStore
}

export async function buildStatsSummary(
  stats: StatsCollector,
  usageStores?: StatsUsageStores,
  refreshUsage = false
): Promise<StatsSummary> {
  const activitySummary = stats.getSummary()
  if (usageStores) {
    try {
      const usageStats = buildUsageStats(usageStores)
      refreshUsageInBackground(usageStores, refreshUsage)
      return {
        ...activitySummary,
        ...usageStats
      }
    } catch (error) {
      console.error('[stats] Failed to read attributed usage:', error)
    }
  }
  try {
    const result = await listAiVaultSessions({
      limit: STATS_AI_VAULT_SESSION_LIMIT,
      limitPerAgent: STATS_AI_VAULT_SESSION_LIMIT
    })
    return {
      ...activitySummary,
      dailyTokens: aggregateDailyTokens(result.sessions),
      tokenDataAvailable: true,
      tokenUnavailableAgents: [...TOKEN_UNAVAILABLE_AGENTS]
    }
  } catch (error) {
    console.error('[stats] Failed to scan token activity:', error)
    return {
      ...activitySummary,
      dailyTokens: [],
      tokenDataAvailable: false,
      tokenUnavailableAgents: [...TOKEN_UNAVAILABLE_AGENTS]
    }
  }
}

function buildUsageStats(
  usageStores: StatsUsageStores
): Pick<
  StatsSummary,
  | 'dailyTokens'
  | 'dailyValues'
  | 'modelUsage'
  | 'tokenDataAvailable'
  | 'tokenUnavailableAgents'
  | 'usageValueAvailable'
  | 'hasUnpricedUsage'
> {
  const usage = buildUsageValueSnapshot({
    claude: usageStores.claude.getSnapshot('yiru', 'all'),
    codex: usageStores.codex.getSnapshot('yiru', 'all'),
    openCode: usageStores.openCode.getSnapshot('yiru', 'all')
  })
  return {
    dailyTokens: usage.daily.map((point) => ({ day: point.day, tokens: point.tokens })),
    dailyValues: usage.daily.flatMap((point) =>
      point.valueUsd === null ? [] : [{ day: point.day, valueUsd: point.valueUsd }]
    ),
    modelUsage: usage.models,
    tokenDataAvailable: true,
    tokenUnavailableAgents: [],
    usageValueAvailable: usage.hasValue,
    hasUnpricedUsage: usage.hasUnpricedUsage
  }
}

function refreshUsageInBackground(usageStores: StatsUsageStores, force: boolean): void {
  void Promise.all([
    usageStores.claude.refresh(force),
    usageStores.codex.refresh(force),
    usageStores.openCode.refresh(force)
  ]).catch((error: unknown) => {
    console.error('[stats] Failed to refresh attributed usage:', error)
  })
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
