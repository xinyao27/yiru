/* eslint-disable max-lines -- Why: provider normalization, totals, and heatmap aggregation share
   one tested model so the overview UI cannot drift from the math. */
import type {
  RuntimeStatsModelUsage,
  RuntimeStatsSupplementalUsage
} from '@yiru/runtime-protocol/mobile-runtime-types'
import {
  AI_VAULT_AGENTS,
  AI_VAULT_AGENT_LABELS,
  type AiVaultAgent
} from '@yiru/workbench-model/agent'
import { translate } from '~renderer/i18n/i18n'
import type {
  ClaudeUsageDailyPoint,
  ClaudeUsageScanState,
  ClaudeUsageSummary
} from '~shared/claude-usage-types'
import type {
  CodexUsageDailyPoint,
  CodexUsageScanState,
  CodexUsageSummary
} from '~shared/codex-usage-types'
import type {
  OpenCodeUsageDailyPoint,
  OpenCodeUsageScanState,
  OpenCodeUsageSummary
} from '~shared/opencode-usage-types'

export type UsageProviderId = 'claude' | 'codex' | 'opencode' | `supplemental:${string}`

export type UsageProviderOverview = {
  id: UsageProviderId
  label: string
  enabled: boolean
  isScanning: boolean
  hasData: boolean
  canEnable: boolean
  lastScanCompletedAt: number | null
  lastScanError: string | null
  sessions: number | null
  activityLabel: 'turns' | 'events'
  activityCount: number | null
  totalTokens: number
  newInputTokens: number
  outputTokens: number
  cacheTokens: number
  reasoningTokens: number
  estimatedCostUsd: number | null
  topModel: string | null
  topProject: string | null
  activeDays: number
}

export type UsageOverviewDailyPoint = {
  day: string
  totalTokens: number
  claudeTokens: number
  codexTokens: number
  openCodeTokens: number
  supplementalTokens: number
  intensity: 0 | 1 | 2 | 3 | 4
}

export type UsageOverviewModel = {
  providers: UsageProviderOverview[]
  enabledProviderCount: number
  dataProviderCount: number
  hasAnyEnabledProvider: boolean
  hasAnyData: boolean
  totalTokens: number
  newInputTokens: number
  outputTokens: number
  cacheTokens: number
  reasoningTokens: number
  sessions: number
  activityCount: number
  activeDays: number
  estimatedCostUsd: number | null
  hasPartialCost: boolean
  cacheShare: number | null
  meteredValueUsd?: number | null
  daily: UsageOverviewDailyPoint[]
  bestDay: UsageOverviewDailyPoint | null
  lastUpdatedAt: number | null
}

export type UsageOverviewInput = {
  claude: {
    scanState: ClaudeUsageScanState | null
    summary: ClaudeUsageSummary | null
    daily: ClaudeUsageDailyPoint[]
  }
  codex: {
    scanState: CodexUsageScanState | null
    summary: CodexUsageSummary | null
    daily: CodexUsageDailyPoint[]
  }
  opencode: {
    scanState: OpenCodeUsageScanState | null
    summary: OpenCodeUsageSummary | null
    daily: OpenCodeUsageDailyPoint[]
  }
  supplemental?: RuntimeStatsSupplementalUsage
}

const AI_VAULT_AGENT_SET = new Set<string>(AI_VAULT_AGENTS)

function getClaudeDailyTotal(entry: ClaudeUsageDailyPoint): number {
  return entry.inputTokens + entry.outputTokens + entry.cacheReadTokens + entry.cacheWriteTokens
}

function getCodexNewInputTokens(summary: CodexUsageSummary | null): number {
  if (!summary) {
    return 0
  }
  return Math.max(summary.inputTokens - summary.cachedInputTokens, 0)
}

function getOpenCodeNewInputTokens(summary: OpenCodeUsageSummary | null): number {
  if (!summary) {
    return 0
  }
  return Math.max(summary.inputTokens - summary.cachedInputTokens, 0)
}

function getIntensity(totalTokens: number, maxTokens: number): 0 | 1 | 2 | 3 | 4 {
  if (totalTokens <= 0 || maxTokens <= 0) {
    return 0
  }
  const ratio = totalTokens / maxTokens
  if (ratio <= 0.25) {
    return 1
  }
  if (ratio <= 0.5) {
    return 2
  }
  if (ratio <= 0.75) {
    return 3
  }
  return 4
}

function countActiveDays(days: string[]): number {
  return new Set(days).size
}

function createClaudeProvider(input: UsageOverviewInput['claude']): UsageProviderOverview {
  const summary = input.summary
  const dailyActiveDays = input.daily
    .filter((entry) => getClaudeDailyTotal(entry) > 0)
    .map((entry) => entry.day)
  return {
    id: 'claude',
    label: translate('auto.components.stats.usage.overview.model.544d6d4c16', 'Claude'),
    enabled: input.scanState?.enabled ?? false,
    isScanning: input.scanState?.isScanning ?? false,
    hasData: summary?.hasAnyClaudeData ?? input.scanState?.hasAnyClaudeData ?? false,
    canEnable: true,
    lastScanCompletedAt: input.scanState?.lastScanCompletedAt ?? null,
    lastScanError: input.scanState?.lastScanError ?? null,
    sessions: summary?.sessions ?? 0,
    activityLabel: 'turns',
    activityCount: summary?.turns ?? 0,
    totalTokens: summary
      ? summary.inputTokens +
        summary.outputTokens +
        summary.cacheReadTokens +
        summary.cacheWriteTokens
      : 0,
    newInputTokens: summary?.inputTokens ?? 0,
    outputTokens: summary?.outputTokens ?? 0,
    cacheTokens: summary ? summary.cacheReadTokens + summary.cacheWriteTokens : 0,
    reasoningTokens: 0,
    estimatedCostUsd: summary?.estimatedCostUsd ?? null,
    topModel: summary?.topModel ?? null,
    topProject: summary?.topProject ?? null,
    activeDays: countActiveDays(dailyActiveDays)
  }
}

function createCodexProvider(input: UsageOverviewInput['codex']): UsageProviderOverview {
  const summary = input.summary
  const dailyActiveDays = input.daily
    .filter((entry) => entry.totalTokens > 0)
    .map((entry) => entry.day)
  return {
    id: 'codex',
    label: translate('auto.components.stats.usage.overview.model.eb220d193b', 'Codex'),
    enabled: input.scanState?.enabled ?? false,
    isScanning: input.scanState?.isScanning ?? false,
    hasData: summary?.hasAnyCodexData ?? input.scanState?.hasAnyCodexData ?? false,
    canEnable: true,
    lastScanCompletedAt: input.scanState?.lastScanCompletedAt ?? null,
    lastScanError: input.scanState?.lastScanError ?? null,
    sessions: summary?.sessions ?? 0,
    activityLabel: 'events',
    activityCount: summary?.events ?? 0,
    totalTokens: summary?.totalTokens ?? 0,
    newInputTokens: getCodexNewInputTokens(summary),
    outputTokens: summary?.outputTokens ?? 0,
    cacheTokens: summary?.cachedInputTokens ?? 0,
    reasoningTokens: summary?.reasoningOutputTokens ?? 0,
    estimatedCostUsd: summary?.estimatedCostUsd ?? null,
    topModel: summary?.topModel ?? null,
    topProject: summary?.topProject ?? null,
    activeDays: countActiveDays(dailyActiveDays)
  }
}

function createOpenCodeProvider(input: UsageOverviewInput['opencode']): UsageProviderOverview {
  const summary = input.summary
  const dailyActiveDays = input.daily
    .filter((entry) => entry.totalTokens > 0)
    .map((entry) => entry.day)
  return {
    id: 'opencode',
    label: translate('auto.components.stats.usage.overview.model.bc474051e5', 'OpenCode'),
    enabled: input.scanState?.enabled ?? false,
    isScanning: input.scanState?.isScanning ?? false,
    hasData: summary?.hasAnyOpenCodeData ?? input.scanState?.hasAnyOpenCodeData ?? false,
    canEnable: true,
    lastScanCompletedAt: input.scanState?.lastScanCompletedAt ?? null,
    lastScanError: input.scanState?.lastScanError ?? null,
    sessions: summary?.sessions ?? 0,
    activityLabel: 'events',
    activityCount: summary?.events ?? 0,
    totalTokens: summary?.totalTokens ?? 0,
    newInputTokens: getOpenCodeNewInputTokens(summary),
    outputTokens: summary?.outputTokens ?? 0,
    cacheTokens: summary?.cachedInputTokens ?? 0,
    reasoningTokens: summary?.reasoningOutputTokens ?? 0,
    estimatedCostUsd: summary?.estimatedCostUsd ?? null,
    topModel: summary?.topModel ?? null,
    topProject: summary?.topProject ?? null,
    activeDays: countActiveDays(dailyActiveDays)
  }
}

type SupplementalProviderAccumulator = {
  id: `supplemental:${string}`
  label: string
  totalTokens: number
  knownValueUsd: number
  hasKnownValue: boolean
  hasUnpricedValue: boolean
  topModel: string | null
  topModelTokens: number
}

function createSupplementalProviders(
  usage: RuntimeStatsSupplementalUsage | undefined
): UsageProviderOverview[] {
  if (!usage) {
    return []
  }
  const providers = new Map<string, SupplementalProviderAccumulator>()
  for (const model of usage.modelUsage) {
    const provider = resolveSupplementalProvider(model)
    const current = providers.get(provider.id) ?? {
      id: provider.id,
      label: provider.label,
      totalTokens: 0,
      knownValueUsd: 0,
      hasKnownValue: false,
      hasUnpricedValue: false,
      topModel: null,
      topModelTokens: 0
    }
    current.totalTokens += model.tokens
    if (model.valueUsd === null) {
      if (model.tokens > 0) {
        current.hasUnpricedValue = true
      }
    } else {
      current.knownValueUsd += model.valueUsd
      current.hasKnownValue = true
    }
    if (model.tokens > current.topModelTokens) {
      current.topModel = model.label
      current.topModelTokens = model.tokens
    }
    providers.set(provider.id, current)
  }
  return [...providers.values()]
    .filter((provider) => provider.totalTokens > 0)
    .map((provider) => ({
      id: provider.id,
      label: provider.label,
      enabled: true,
      canEnable: false,
      isScanning: false,
      hasData: true,
      lastScanCompletedAt: null,
      lastScanError: null,
      sessions: null,
      activityLabel: 'events',
      activityCount: null,
      totalTokens: provider.totalTokens,
      newInputTokens: provider.totalTokens,
      outputTokens: 0,
      cacheTokens: 0,
      reasoningTokens: 0,
      estimatedCostUsd:
        provider.hasKnownValue && !provider.hasUnpricedValue ? provider.knownValueUsd : null,
      topModel: provider.topModel,
      topProject: null,
      activeDays: 0
    }))
}

function resolveSupplementalProvider(model: RuntimeStatsModelUsage): {
  id: `supplemental:${string}`
  label: string
} {
  const parts = model.key.split(':')
  if (parts[0] === 'cursor') {
    return { id: 'supplemental:cursor', label: AI_VAULT_AGENT_LABELS.cursor }
  }
  const agent = parts[0] === 'ai-vault' ? parts[1] : undefined
  if (agent && isAiVaultAgent(agent)) {
    return { id: `supplemental:${agent}`, label: AI_VAULT_AGENT_LABELS[agent] }
  }
  return {
    id: 'supplemental:other',
    label: translate('auto.components.stats.usage.overview.model.other', 'Other agents')
  }
}

function isAiVaultAgent(value: string): value is AiVaultAgent {
  return AI_VAULT_AGENT_SET.has(value)
}

function buildDailyOverview(input: UsageOverviewInput): UsageOverviewDailyPoint[] {
  const byDay = new Map<string, Omit<UsageOverviewDailyPoint, 'intensity'>>()

  for (const entry of input.claude.daily) {
    const current = byDay.get(entry.day) ?? {
      day: entry.day,
      totalTokens: 0,
      claudeTokens: 0,
      codexTokens: 0,
      openCodeTokens: 0,
      supplementalTokens: 0
    }
    const total = getClaudeDailyTotal(entry)
    current.totalTokens += total
    current.claudeTokens += total
    byDay.set(entry.day, current)
  }

  for (const entry of input.codex.daily) {
    const current = byDay.get(entry.day) ?? {
      day: entry.day,
      totalTokens: 0,
      claudeTokens: 0,
      codexTokens: 0,
      openCodeTokens: 0,
      supplementalTokens: 0
    }
    current.totalTokens += entry.totalTokens
    current.codexTokens += entry.totalTokens
    byDay.set(entry.day, current)
  }

  for (const entry of input.opencode.daily) {
    const current = byDay.get(entry.day) ?? {
      day: entry.day,
      totalTokens: 0,
      claudeTokens: 0,
      codexTokens: 0,
      openCodeTokens: 0,
      supplementalTokens: 0
    }
    current.totalTokens += entry.totalTokens
    current.openCodeTokens += entry.totalTokens
    byDay.set(entry.day, current)
  }

  for (const entry of input.supplemental?.dailyTokens ?? []) {
    const current = byDay.get(entry.day) ?? {
      day: entry.day,
      totalTokens: 0,
      claudeTokens: 0,
      codexTokens: 0,
      openCodeTokens: 0,
      supplementalTokens: 0
    }
    current.totalTokens += entry.tokens
    current.supplementalTokens += entry.tokens
    byDay.set(entry.day, current)
  }

  let maxTokens = 0
  // Why: usage history can be large enough to exceed V8's argument limit if
  // every day is spread into Math.max.
  for (const entry of byDay.values()) {
    maxTokens = Math.max(maxTokens, entry.totalTokens)
  }
  return [...byDay.values()]
    .sort((left, right) => left.day.localeCompare(right.day))
    .map((entry) => ({
      ...entry,
      intensity: getIntensity(entry.totalTokens, maxTokens)
    }))
}

function formatLocalDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getRecentUsageDays(
  daily: UsageOverviewDailyPoint[],
  dayCount: number,
  anchorDate = new Date()
): UsageOverviewDailyPoint[] {
  const byDay = new Map(daily.map((entry) => [entry.day, entry]))
  const count = Math.max(1, Math.floor(dayCount))
  const end = new Date(anchorDate)
  end.setHours(0, 0, 0, 0)

  const result: UsageOverviewDailyPoint[] = []
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(end)
    date.setDate(end.getDate() - offset)
    const day = formatLocalDay(date)
    result.push(
      byDay.get(day) ?? {
        day,
        totalTokens: 0,
        claudeTokens: 0,
        codexTokens: 0,
        openCodeTokens: 0,
        supplementalTokens: 0,
        intensity: 0
      }
    )
  }
  return result
}

export function buildUsageOverview(input: UsageOverviewInput): UsageOverviewModel {
  const providers = [
    createClaudeProvider(input.claude),
    createCodexProvider(input.codex),
    createOpenCodeProvider(input.opencode),
    ...createSupplementalProviders(input.supplemental)
  ]
  const daily = buildDailyOverview(input)
  const bestDay =
    daily.length === 0
      ? null
      : daily.reduce<UsageOverviewDailyPoint | null>(
          (best, entry) => (!best || entry.totalTokens > best.totalTokens ? entry : best),
          null
        )
  const totalTokens = providers.reduce((sum, provider) => sum + provider.totalTokens, 0)
  const newInputTokens = providers.reduce((sum, provider) => sum + provider.newInputTokens, 0)
  const outputTokens = providers.reduce((sum, provider) => sum + provider.outputTokens, 0)
  const cacheTokens = providers.reduce((sum, provider) => sum + provider.cacheTokens, 0)
  const reasoningTokens = providers.reduce((sum, provider) => sum + provider.reasoningTokens, 0)
  const sessions = providers.reduce((sum, provider) => sum + (provider.sessions ?? 0), 0)
  const activityCount = providers.reduce((sum, provider) => sum + (provider.activityCount ?? 0), 0)
  const knownCost = providers.reduce((sum, provider) => sum + (provider.estimatedCostUsd ?? 0), 0)
  const hasKnownCost = providers.some((provider) => provider.estimatedCostUsd !== null)
  const hasPartialCost = providers.some(
    (provider) => provider.hasData && provider.estimatedCostUsd === null
  )
  const lastUpdatedAt =
    providers.reduce<number | null>(
      (latest, provider) =>
        provider.lastScanCompletedAt && (!latest || provider.lastScanCompletedAt > latest)
          ? provider.lastScanCompletedAt
          : latest,
      null
    ) ?? null

  return {
    providers,
    enabledProviderCount: providers.filter((provider) => provider.enabled).length,
    dataProviderCount: providers.filter((provider) => provider.hasData).length,
    hasAnyEnabledProvider: providers.some((provider) => provider.enabled),
    hasAnyData: providers.some((provider) => provider.hasData),
    totalTokens,
    newInputTokens,
    outputTokens,
    cacheTokens,
    reasoningTokens,
    sessions,
    activityCount,
    activeDays: countActiveDays(
      daily.filter((entry) => entry.totalTokens > 0).map((entry) => entry.day)
    ),
    estimatedCostUsd: hasKnownCost ? knownCost : null,
    hasPartialCost,
    cacheShare:
      newInputTokens + cacheTokens > 0 ? cacheTokens / (newInputTokens + cacheTokens) : null,
    ...(input.supplemental?.meteredValueUsd === undefined
      ? {}
      : { meteredValueUsd: input.supplemental.meteredValueUsd }),
    daily,
    bestDay,
    lastUpdatedAt
  }
}

export function formatUsageTokens(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }
  return value.toLocaleString()
}

export function formatUsageCost(value: number | null): string {
  if (value === null) {
    return 'n/a'
  }
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}
