import type {
  RuntimeStatsDailyProviderUsage,
  RuntimeStatsProjectUsage,
  RuntimeStatsProviderUsage,
  RuntimeStatsSummary,
  RuntimeStatsUsageProvider
} from '@yiru/runtime-protocol/mobile-runtime-types'

import { recordValue } from '../stats-payload-record'
import { HOME_USAGE_PROVIDERS } from './provider-presentation'

type ProviderAccumulator = {
  provider: RuntimeStatsUsageProvider
  tokens: number
  knownValueUsd: number
  unpricedTokens: number
}

type ProjectAccumulator = {
  key: string
  label: string
  sessions: number
  tokens: number
  knownValueUsd: number
  unpricedTokens: number
  providers: Map<RuntimeStatsUsageProvider, ProviderAccumulator>
}

export function parseDailyProviderUsage(
  value: unknown
): RuntimeStatsDailyProviderUsage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.flatMap((entry) => {
    const item = recordValue(entry)
    if (!item || typeof item.day !== 'string') {
      return []
    }
    return [{ day: item.day, providers: parseProviderUsage(item.providers) }]
  })
}

export function parseProjectUsage(value: unknown): RuntimeStatsProjectUsage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.flatMap((entry) => {
    const item = recordValue(entry)
    if (
      !item ||
      typeof item.key !== 'string' ||
      typeof item.label !== 'string' ||
      typeof item.sessions !== 'number' ||
      typeof item.tokens !== 'number' ||
      !(item.valueUsd === null || typeof item.valueUsd === 'number')
    ) {
      return []
    }
    return [
      {
        key: item.key,
        label: item.label,
        sessions: item.sessions,
        tokens: item.tokens,
        valueUsd: item.valueUsd,
        providers: parseProviderUsage(item.providers)
      }
    ]
  })
}

export function mergeDailyProviderUsage(
  summaries: readonly RuntimeStatsSummary[]
): RuntimeStatsDailyProviderUsage[] {
  const byDay = new Map<string, Map<RuntimeStatsUsageProvider, ProviderAccumulator>>()
  for (const summary of summaries) {
    for (const point of summary.dailyProviderUsage ?? []) {
      const providers = byDay.get(point.day) ?? new Map()
      for (const usage of point.providers) {
        addProviderUsage(providers, usage)
      }
      byDay.set(point.day, providers)
    }
  }
  return [...byDay.entries()]
    .map(([day, providers]) => ({ day, providers: finalizeProviders(providers) }))
    .sort((left, right) => left.day.localeCompare(right.day))
}

export function mergeProjectUsage(
  summaries: readonly RuntimeStatsSummary[]
): RuntimeStatsProjectUsage[] {
  const byProject = new Map<string, ProjectAccumulator>()
  for (const summary of summaries) {
    for (const project of summary.projectUsage ?? []) {
      // Why: the same repo checked out on two hosts is one project to the reader,
      // so rows merge on the host-independent key like model usage already does.
      const key = project.key.trim().toLowerCase() || project.label.trim().toLowerCase()
      const current = byProject.get(key) ?? {
        key,
        label: project.label,
        sessions: 0,
        tokens: 0,
        knownValueUsd: 0,
        unpricedTokens: 0,
        providers: new Map()
      }
      current.sessions += project.sessions
      current.tokens += project.tokens
      if (project.valueUsd === null) {
        current.unpricedTokens += project.tokens
      } else {
        current.knownValueUsd += project.valueUsd
      }
      for (const usage of project.providers) {
        addProviderUsage(current.providers, usage)
      }
      byProject.set(key, current)
    }
  }
  return [...byProject.values()]
    .map((project) => ({
      key: project.key,
      label: project.label,
      sessions: project.sessions,
      tokens: project.tokens,
      valueUsd: project.unpricedTokens === 0 ? project.knownValueUsd : null,
      providers: finalizeProviders(project.providers)
    }))
    .sort((left, right) => right.tokens - left.tokens)
}

function parseProviderUsage(value: unknown): RuntimeStatsProviderUsage[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    const item = recordValue(entry)
    if (
      !item ||
      !isUsageProvider(item.provider) ||
      typeof item.tokens !== 'number' ||
      !(item.valueUsd === null || typeof item.valueUsd === 'number')
    ) {
      return []
    }
    return [{ provider: item.provider, tokens: item.tokens, valueUsd: item.valueUsd }]
  })
}

function isUsageProvider(value: unknown): value is RuntimeStatsUsageProvider {
  return typeof value === 'string' && HOME_USAGE_PROVIDERS.some((provider) => provider === value)
}

function addProviderUsage(
  target: Map<RuntimeStatsUsageProvider, ProviderAccumulator>,
  usage: RuntimeStatsProviderUsage
): void {
  const current = target.get(usage.provider) ?? {
    provider: usage.provider,
    tokens: 0,
    knownValueUsd: 0,
    unpricedTokens: 0
  }
  current.tokens += usage.tokens
  if (usage.valueUsd === null) {
    current.unpricedTokens += usage.tokens
  } else {
    current.knownValueUsd += usage.valueUsd
  }
  target.set(usage.provider, current)
}

function finalizeProviders(
  providers: Map<RuntimeStatsUsageProvider, ProviderAccumulator>
): RuntimeStatsProviderUsage[] {
  // Why: a fixed provider order keeps stacked bars and legend rows from
  // reshuffling between refreshes when a provider reports nothing that day.
  return HOME_USAGE_PROVIDERS.flatMap((provider) => {
    const usage = providers.get(provider)
    if (!usage) {
      return []
    }
    return [
      {
        provider,
        tokens: usage.tokens,
        valueUsd: usage.unpricedTokens === 0 ? usage.knownValueUsd : null
      }
    ]
  })
}
