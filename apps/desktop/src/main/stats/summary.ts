import type { RuntimeStatsSupplementalUsage } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { AiVaultAgent, AiVaultSession } from '@yiru/workbench-model/agent'
import { buildUsageValueSnapshot } from '~shared/stats/usage-value'
import type { StatsSummary } from '~shared/types'

import { listAiVaultSessions } from '../ai-vault/cached-session-list'
import type { ClaudeUsageStore } from '../claude/usage/store'
import type { CodexUsageStore } from '../codex/usage/store'
import type { OpenCodeUsageStore } from '../opencode/usage/store'
import { buildSupplementalAgentUsage } from './agent-usage'
import type { StatsCollector } from './collector'
import { refreshModelsDevPricing } from './models-dev-pricing'

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
  getUsageScopePaths?: () => readonly string[]
  getCursorUsage?: (force: boolean) => Promise<RuntimeStatsSupplementalUsage>
}

type UsageStats = Pick<
  StatsSummary,
  | 'dailyTokens'
  | 'dailyUnpricedTokens'
  | 'dailyValues'
  | 'modelUsage'
  | 'tokenDataAvailable'
  | 'tokenUnavailableAgents'
  | 'supplementalUsage'
  | 'usageValueAvailable'
  | 'hasUnpricedUsage'
>

export async function buildStatsSummary(
  stats: StatsCollector,
  usageStores?: StatsUsageStores,
  refreshUsage = false
): Promise<StatsSummary> {
  const activitySummary = stats.getSummary()
  if (usageStores) {
    try {
      const usageStats = await buildUsageStats(usageStores, refreshUsage)
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

async function buildUsageStats(
  usageStores: StatsUsageStores,
  forceSupplementalScan: boolean
): Promise<UsageStats> {
  const supplementalUsage = await scanSupplementalUsage(usageStores, forceSupplementalScan)
  const usage = buildUsageValueSnapshot({
    claude: usageStores.claude.getSnapshot('yiru', 'all'),
    codex: usageStores.codex.getSnapshot('yiru', 'all'),
    openCode: usageStores.openCode.getSnapshot('yiru', 'all'),
    supplemental: {
      daily: supplementalUsage.dailyTokens.map((point) => ({
        day: point.day,
        tokens: point.tokens,
        valueUsd: point.valueUsd,
        unpricedTokens: point.unpricedTokens
      })),
      models: supplementalUsage.modelUsage
    }
  })
  return {
    dailyTokens: usage.daily.map((point) => ({ day: point.day, tokens: point.tokens })),
    dailyUnpricedTokens: usage.daily.flatMap((point) =>
      point.unpricedTokens > 0 ? [{ day: point.day, tokens: point.unpricedTokens }] : []
    ),
    dailyValues: usage.daily.flatMap((point) =>
      point.valueUsd === null ? [] : [{ day: point.day, valueUsd: point.valueUsd }]
    ),
    modelUsage: usage.models,
    tokenDataAvailable: true,
    tokenUnavailableAgents: tokenUnavailableAgents(supplementalUsage),
    supplementalUsage,
    usageValueAvailable: usage.hasValue,
    hasUnpricedUsage: usage.hasUnpricedUsage
  }
}

function tokenUnavailableAgents(supplementalUsage: RuntimeStatsSupplementalUsage): AiVaultAgent[] {
  const hasCursorTokens = supplementalUsage.modelUsage.some(
    (model) => model.key.startsWith('cursor:') && model.tokens > 0
  )
  return hasCursorTokens
    ? TOKEN_UNAVAILABLE_AGENTS.filter((agent) => agent !== 'cursor')
    : [...TOKEN_UNAVAILABLE_AGENTS]
}

async function scanSupplementalUsage(
  usageStores: StatsUsageStores,
  force: boolean
): Promise<RuntimeStatsSupplementalUsage> {
  const scopePaths = usageStores.getUsageScopePaths?.() ?? []
  const cursorUsage = usageStores.getCursorUsage
    ? await usageStores.getCursorUsage(force)
    : { dailyTokens: [], modelUsage: [] }
  const agentUsage =
    scopePaths.length === 0
      ? { dailyTokens: [], modelUsage: [] }
      : await scanScopedAgentUsage(scopePaths, force)
  return mergeSupplementalUsage(agentUsage, cursorUsage)
}

async function scanScopedAgentUsage(
  scopePaths: readonly string[],
  force: boolean
): Promise<RuntimeStatsSupplementalUsage> {
  try {
    const result = await listAiVaultSessions({
      limit: STATS_AI_VAULT_SESSION_LIMIT,
      limitPerAgent: STATS_AI_VAULT_SESSION_LIMIT,
      scopePaths,
      force
    })
    return buildSupplementalAgentUsage(result.sessions, scopePaths)
  } catch (error) {
    console.error('[stats] Failed to scan supplemental agent usage:', error)
    return { dailyTokens: [], modelUsage: [] }
  }
}

function mergeSupplementalUsage(
  left: RuntimeStatsSupplementalUsage,
  right: RuntimeStatsSupplementalUsage
): RuntimeStatsSupplementalUsage {
  const meteredValueUsd = mergeMeteredValue(left.meteredValueUsd, right.meteredValueUsd)
  return {
    dailyTokens: [...left.dailyTokens, ...right.dailyTokens],
    modelUsage: [...left.modelUsage, ...right.modelUsage],
    ...(meteredValueUsd === undefined ? {} : { meteredValueUsd })
  }
}

function mergeMeteredValue(
  left: number | null | undefined,
  right: number | null | undefined
): number | null | undefined {
  if (left === undefined) {
    return right
  }
  if (right === undefined) {
    return left
  }
  if (left === null || right === null) {
    return null
  }
  return left + right
}

function refreshUsageInBackground(usageStores: StatsUsageStores, force: boolean): void {
  void refreshModelsDevPricing()
    .then((pricingChanged) =>
      Promise.all([
        usageStores.claude.refresh(force || pricingChanged),
        usageStores.codex.refresh(force || pricingChanged),
        usageStores.openCode.refresh(force)
      ])
    )
    .catch((error: unknown) => {
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
