import type { ClaudeUsageBreakdownRow, ClaudeUsageDailyPoint } from '~shared/claude-usage-types'
import type { CodexUsageBreakdownRow, CodexUsageDailyPoint } from '~shared/codex-usage-types'
import type {
  OpenCodeUsageBreakdownRow,
  OpenCodeUsageDailyPoint
} from '~shared/opencode-usage-types'

export type UsageProvider = 'claude' | 'codex' | 'open-code'

export type ProviderUsageValue = {
  provider: UsageProvider
  tokens: number
  valueUsd: number | null
}

export type ProjectUsageValue = {
  key: string
  label: string
  sessions: number
  tokens: number
  valueUsd: number | null
  providers: ProviderUsageValue[]
}

export type DailyProviderUsage = {
  day: string
  providers: ProviderUsageValue[]
}

type ProjectUsageInput = {
  key: string
  label: string
  provider: UsageProvider
  sessions: number
  tokens: number
  valueUsd: number | null
}

type ProjectUsageAccumulator = Omit<ProjectUsageValue, 'providers' | 'valueUsd'> & {
  knownValueUsd: number
  providers: ProviderUsageValue[]
  unpricedTokens: number
}

type UsageAggregationInput = {
  claudeProjects: ClaudeUsageBreakdownRow[]
  claudeDaily: ClaudeUsageDailyPoint[]
  codexProjects: CodexUsageBreakdownRow[]
  codexDaily: CodexUsageDailyPoint[]
  openCodeProjects: OpenCodeUsageBreakdownRow[]
  openCodeDaily: OpenCodeUsageDailyPoint[]
}

export function buildProjectUsage(input: UsageAggregationInput): ProjectUsageValue[] {
  return mergeProjectUsage([
    ...input.claudeProjects.map(
      (project): ProjectUsageInput => ({
        key: project.key,
        label: project.label,
        provider: 'claude',
        sessions: project.sessions,
        tokens:
          project.inputTokens +
          project.outputTokens +
          project.cacheReadTokens +
          project.cacheWriteTokens,
        valueUsd: project.estimatedCostUsd
      })
    ),
    ...input.codexProjects.map(
      (project): ProjectUsageInput => ({
        key: project.key,
        label: project.label,
        provider: 'codex',
        sessions: project.sessions,
        tokens: project.totalTokens,
        valueUsd: project.estimatedCostUsd
      })
    ),
    ...input.openCodeProjects.map(
      (project): ProjectUsageInput => ({
        key: project.key,
        label: project.label,
        provider: 'open-code',
        sessions: project.sessions,
        tokens: project.totalTokens,
        valueUsd: project.estimatedCostUsd
      })
    )
  ])
}

export function buildDailyProviderUsage(input: UsageAggregationInput): DailyProviderUsage[] {
  const byDay = new Map<string, ProviderUsageValue[]>()
  addDailyProviderUsage(
    byDay,
    'claude',
    input.claudeDaily.map((point) => ({
      day: point.day,
      tokens:
        point.inputTokens + point.outputTokens + point.cacheReadTokens + point.cacheWriteTokens,
      estimatedCostUsd: point.estimatedCostUsd
    }))
  )
  addDailyProviderUsage(byDay, 'codex', input.codexDaily)
  addDailyProviderUsage(byDay, 'open-code', input.openCodeDaily)
  return [...byDay.entries()]
    .map(([day, providers]) => ({ day, providers }))
    .sort((left, right) => left.day.localeCompare(right.day))
}

function addDailyProviderUsage(
  target: Map<string, ProviderUsageValue[]>,
  provider: UsageProvider,
  points: {
    day: string
    totalTokens?: number
    tokens?: number
    estimatedCostUsd: number | null
  }[]
): void {
  for (const point of points) {
    const providers = target.get(point.day) ?? []
    providers.push({
      provider,
      tokens: point.tokens ?? point.totalTokens ?? 0,
      valueUsd: point.estimatedCostUsd
    })
    target.set(point.day, providers)
  }
}

function mergeProjectUsage(projects: ProjectUsageInput[]): ProjectUsageValue[] {
  const byProject = new Map<string, ProjectUsageAccumulator>()
  for (const project of projects) {
    const current = byProject.get(project.key) ?? {
      key: project.key,
      label: project.label,
      sessions: 0,
      tokens: 0,
      knownValueUsd: 0,
      unpricedTokens: 0,
      providers: []
    }
    current.sessions += project.sessions
    current.tokens += project.tokens
    if (project.valueUsd === null) {
      current.unpricedTokens += project.tokens
    } else {
      current.knownValueUsd += project.valueUsd
    }
    current.providers.push({
      provider: project.provider,
      tokens: project.tokens,
      valueUsd: project.valueUsd
    })
    byProject.set(project.key, current)
  }
  return [...byProject.values()]
    .map((project) => ({
      key: project.key,
      label: project.label,
      sessions: project.sessions,
      tokens: project.tokens,
      valueUsd: project.unpricedTokens === 0 ? project.knownValueUsd : null,
      providers: project.providers
    }))
    .sort((left, right) => right.tokens - left.tokens)
}
