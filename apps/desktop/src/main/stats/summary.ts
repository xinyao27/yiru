import type { RuntimeStatsSupplementalUsage } from '@yiru/runtime-protocol/mobile-runtime-types'
import {
  dayIsInStatsUsageRange,
  type StatsUsageRange
} from '@yiru/runtime-protocol/stats-usage-range'
import type { AiVaultAgent, AiVaultSession } from '@yiru/workbench-model/agent'
import { buildDailyProviderUsage, buildProjectUsage } from '~shared/stats/usage-breakdown'
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
const STATS_SUPPLEMENTAL_AGENTS = [
  'hermes',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'rovo',
  'copilot',
  'grok',
  'openclaw',
  'devin',
  'droid',
  'kimi'
] as const satisfies readonly AiVaultAgent[]
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
  | 'dailyProviderUsage'
  | 'dailyTokens'
  | 'dailyUnpricedTokens'
  | 'dailyValues'
  | 'modelUsage'
  | 'projectUsage'
  | 'tokenDataAvailable'
  | 'tokenUnavailableAgents'
  | 'supplementalUsage'
  | 'usageRange'
  | 'usageValueAvailable'
  | 'hasUnpricedUsage'
>

export type StatsSummaryOptions = {
  refreshUsage?: boolean
  range?: StatsUsageRange
}

export async function buildStatsSummary(
  stats: StatsCollector,
  usageStores?: StatsUsageStores,
  { range = 'all', refreshUsage = false }: StatsSummaryOptions = {}
): Promise<StatsSummary> {
  const activitySummary = stats.getSummary()
  if (usageStores) {
    try {
      const usageStats = await buildUsageStats(usageStores, range, refreshUsage)
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
      tokenUnavailableAgents: [...TOKEN_UNAVAILABLE_AGENTS],
      // Why: the session-scan fallback has no ranged index, so it reports the
      // all-time window it actually measured instead of the requested range.
      usageRange: 'all'
    }
  } catch (error) {
    console.error('[stats] Failed to scan token activity:', error)
    return {
      ...activitySummary,
      dailyTokens: [],
      tokenDataAvailable: false,
      tokenUnavailableAgents: [...TOKEN_UNAVAILABLE_AGENTS],
      usageRange: 'all'
    }
  }
}

async function buildUsageStats(
  usageStores: StatsUsageStores,
  range: StatsUsageRange,
  forceSupplementalScan: boolean
): Promise<UsageStats> {
  const [supplementalUsage] = await Promise.all([
    scanSupplementalUsage(usageStores, forceSupplementalScan),
    prepareAttributedUsage(usageStores, forceSupplementalScan)
  ])
  const snapshots = {
    claude: usageStores.claude.getSnapshot('yiru', range),
    codex: usageStores.codex.getSnapshot('yiru', range),
    openCode: usageStores.openCode.getSnapshot('yiru', range)
  }
  const usage = buildUsageValueSnapshot({
    ...snapshots,
    supplemental: {
      daily: supplementalUsage.dailyTokens
        .filter((point) => dayIsInStatsUsageRange(point.day, range))
        .map((point) => ({
          day: point.day,
          tokens: point.tokens,
          valueUsd: point.valueUsd,
          unpricedTokens: point.unpricedTokens
        })),
      // Why: supplemental model totals carry no day attribution, so a bounded
      // range would mix all-time model usage into a windowed total.
      models: range === 'all' ? supplementalUsage.modelUsage : []
    }
  })
  return {
    dailyProviderUsage: buildDailyProviderUsage(snapshots),
    dailyTokens: usage.daily.map((point) => ({ day: point.day, tokens: point.tokens })),
    dailyUnpricedTokens: usage.daily.flatMap((point) =>
      point.unpricedTokens > 0 ? [{ day: point.day, tokens: point.unpricedTokens }] : []
    ),
    dailyValues: usage.daily.flatMap((point) =>
      point.valueUsd === null ? [] : [{ day: point.day, valueUsd: point.valueUsd }]
    ),
    modelUsage: usage.models,
    projectUsage: buildProjectUsage(snapshots),
    tokenDataAvailable: true,
    tokenUnavailableAgents: tokenUnavailableAgents(supplementalUsage),
    supplementalUsage,
    usageRange: range,
    usageValueAvailable: usage.hasValue,
    hasUnpricedUsage: usage.hasUnpricedUsage
  }
}

async function prepareAttributedUsage(
  usageStores: StatsUsageStores,
  force: boolean
): Promise<void> {
  await enableUsageScans(usageStores)
  if (!force) {
    return
  }

  // Why: an explicit refresh must finish before its summary is built. The old
  // background pass returned stale data and made desktop refresh every provider twice.
  await refreshModelsDevPricing()
  await Promise.all([
    usageStores.claude.refresh(true),
    usageStores.codex.refresh(true),
    usageStores.openCode.refresh(true)
  ])
}

// Why: a headless host has no Home page to activate provider scanning, so asking
// for usage is what turns it on — the same activation the desktop renderer does
// when the Home page opens.
async function enableUsageScans(usageStores: StatsUsageStores): Promise<void> {
  await Promise.all([
    usageStores.claude.getScanState().enabled ? null : usageStores.claude.setEnabled(true),
    usageStores.codex.getScanState().enabled ? null : usageStores.codex.setEnabled(true),
    usageStores.openCode.getScanState().enabled ? null : usageStores.openCode.setEnabled(true)
  ])
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
      agents: STATS_SUPPLEMENTAL_AGENTS,
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
