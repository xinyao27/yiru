import type { RuntimeStatsSummary } from '@yiru/runtime-protocol/mobile-runtime-types'
import { isStatsUsageRange } from '@yiru/runtime-protocol/stats-usage-range'
import { AI_VAULT_AGENTS, type AiVaultAgent } from '@yiru/workbench-model/agent'

import { recordValue } from './stats-payload-record'
import {
  mergeDailyProviderUsage,
  mergeProjectUsage,
  parseDailyProviderUsage,
  parseProjectUsage
} from './usage/breakdown'
import { aggregateSupplementalUsage, parseSupplementalUsage } from './usage/supplemental'

const AI_VAULT_AGENT_SET = new Set<string>(AI_VAULT_AGENTS)

export type HomeStatsByHost = Record<string, RuntimeStatsSummary>

export function parseRuntimeStatsSummary(value: unknown): RuntimeStatsSummary | null {
  const record = recordValue(value)
  if (
    !record ||
    typeof record.totalAgentsSpawned !== 'number' ||
    typeof record.totalPRsCreated !== 'number' ||
    typeof record.totalAgentTimeMs !== 'number' ||
    !(record.firstEventAt === null || typeof record.firstEventAt === 'number')
  ) {
    return null
  }
  const dailyActivity = Array.isArray(record.dailyActivity)
    ? record.dailyActivity.flatMap((entry) => {
        const item = recordValue(entry)
        return item &&
          typeof item.day === 'string' &&
          typeof item.agentStarts === 'number' &&
          typeof item.prsCreated === 'number'
          ? [{ day: item.day, agentStarts: item.agentStarts, prsCreated: item.prsCreated }]
          : []
      })
    : undefined
  const dailyTokens = Array.isArray(record.dailyTokens)
    ? record.dailyTokens.flatMap((entry) => {
        const item = recordValue(entry)
        return item && typeof item.day === 'string' && typeof item.tokens === 'number'
          ? [{ day: item.day, tokens: item.tokens }]
          : []
      })
    : undefined
  const dailyValues = Array.isArray(record.dailyValues)
    ? record.dailyValues.flatMap((entry) => {
        const item = recordValue(entry)
        return item && typeof item.day === 'string' && typeof item.valueUsd === 'number'
          ? [{ day: item.day, valueUsd: item.valueUsd }]
          : []
      })
    : undefined
  const dailyUnpricedTokens = Array.isArray(record.dailyUnpricedTokens)
    ? record.dailyUnpricedTokens.flatMap((entry) => {
        const item = recordValue(entry)
        return item && typeof item.day === 'string' && typeof item.tokens === 'number'
          ? [{ day: item.day, tokens: item.tokens }]
          : []
      })
    : undefined
  const modelUsage = Array.isArray(record.modelUsage)
    ? record.modelUsage.flatMap((entry) => {
        const item = recordValue(entry)
        return item &&
          typeof item.key === 'string' &&
          typeof item.label === 'string' &&
          typeof item.tokens === 'number' &&
          (item.valueUsd === null || typeof item.valueUsd === 'number')
          ? [
              {
                key: item.key,
                label: item.label,
                tokens: item.tokens,
                valueUsd: item.valueUsd
              }
            ]
          : []
      })
    : undefined
  const supplementalUsage = parseSupplementalUsage(record.supplementalUsage)
  const tokenUnavailableAgents = Array.isArray(record.tokenUnavailableAgents)
    ? record.tokenUnavailableAgents.filter(isAiVaultAgent)
    : undefined
  return {
    totalAgentsSpawned: record.totalAgentsSpawned,
    totalPRsCreated: record.totalPRsCreated,
    totalAgentTimeMs: record.totalAgentTimeMs,
    firstEventAt: record.firstEventAt,
    dailyActivity,
    dailyProviderUsage: parseDailyProviderUsage(record.dailyProviderUsage),
    dailyTokens,
    dailyUnpricedTokens,
    dailyValues,
    modelUsage,
    projectUsage: parseProjectUsage(record.projectUsage),
    supplementalUsage,
    usageRange: isStatsUsageRange(record.usageRange) ? record.usageRange : undefined,
    tokenDataAvailable:
      typeof record.tokenDataAvailable === 'boolean' ? record.tokenDataAvailable : undefined,
    tokenUnavailableAgents,
    usageValueAvailable:
      typeof record.usageValueAvailable === 'boolean' ? record.usageValueAvailable : undefined,
    hasUnpricedUsage:
      typeof record.hasUnpricedUsage === 'boolean' ? record.hasUnpricedUsage : undefined
  }
}

export function aggregateHomeStats(statsByHost: HomeStatsByHost): RuntimeStatsSummary | null {
  const summaries = Object.values(statsByHost)
  if (summaries.length === 0) {
    return null
  }
  const dailyActivity = new Map<string, { agentStarts: number; prsCreated: number }>()
  const dailyTokens = new Map<string, number>()
  const dailyUnpricedTokens = new Set<string>()
  const dailyValues = new Map<string, number>()
  const models = new Map<
    string,
    {
      key: string
      label: string
      tokens: number
      valueUsd: number | null
      hasUnpricedValue: boolean
    }
  >()
  const unavailableAgents = new Set<
    NonNullable<RuntimeStatsSummary['tokenUnavailableAgents']>[number]
  >()
  let firstEventAt: number | null = null
  const supplementalUsage = aggregateSupplementalUsage(summaries)

  for (const summary of summaries) {
    if (summary.firstEventAt !== null) {
      firstEventAt =
        firstEventAt === null ? summary.firstEventAt : Math.min(firstEventAt, summary.firstEventAt)
    }
    for (const entry of summary.dailyActivity ?? []) {
      const current = dailyActivity.get(entry.day) ?? { agentStarts: 0, prsCreated: 0 }
      current.agentStarts += entry.agentStarts
      current.prsCreated += entry.prsCreated
      dailyActivity.set(entry.day, current)
    }
    for (const entry of summary.dailyTokens ?? []) {
      dailyTokens.set(entry.day, (dailyTokens.get(entry.day) ?? 0) + entry.tokens)
    }
    for (const entry of summary.dailyValues ?? []) {
      dailyValues.set(entry.day, (dailyValues.get(entry.day) ?? 0) + entry.valueUsd)
    }
    for (const entry of summary.dailyUnpricedTokens ?? []) {
      if (entry.tokens > 0) {
        dailyUnpricedTokens.add(entry.day)
      }
    }
    for (const entry of summary.modelUsage ?? []) {
      const key = entry.key.trim().toLowerCase() || entry.label.trim().toLowerCase()
      const current = models.get(key) ?? {
        key,
        label: entry.label,
        tokens: 0,
        valueUsd: null,
        hasUnpricedValue: false
      }
      current.tokens += entry.tokens
      if (entry.valueUsd !== null) {
        current.valueUsd = (current.valueUsd ?? 0) + entry.valueUsd
      } else if (entry.tokens > 0) {
        current.hasUnpricedValue = true
      }
      models.set(key, current)
    }
    for (const agent of summary.tokenUnavailableAgents ?? []) {
      unavailableAgents.add(agent)
    }
  }

  return {
    totalAgentsSpawned: summaries.reduce((sum, entry) => sum + entry.totalAgentsSpawned, 0),
    totalPRsCreated: summaries.reduce((sum, entry) => sum + entry.totalPRsCreated, 0),
    totalAgentTimeMs: summaries.reduce((sum, entry) => sum + entry.totalAgentTimeMs, 0),
    firstEventAt,
    dailyActivity: [...dailyActivity.entries()]
      .map(([day, value]) => ({ day, ...value }))
      .sort((left, right) => left.day.localeCompare(right.day)),
    dailyTokens: [...dailyTokens.entries()]
      .map(([day, tokens]) => ({ day, tokens }))
      .sort((left, right) => left.day.localeCompare(right.day)),
    dailyValues: [...dailyValues.entries()]
      .flatMap(([day, valueUsd]) => (dailyUnpricedTokens.has(day) ? [] : [{ day, valueUsd }]))
      .sort((left, right) => left.day.localeCompare(right.day)),
    dailyProviderUsage: mergeDailyProviderUsage(summaries),
    modelUsage: [...models.values()]
      .map((model) => ({
        key: model.key,
        label: model.label,
        tokens: model.tokens,
        valueUsd: model.hasUnpricedValue ? null : model.valueUsd
      }))
      .sort((left, right) => right.tokens - left.tokens),
    projectUsage: mergeProjectUsage(summaries),
    usageRange: mergedUsageRange(summaries),
    tokenDataAvailable: summaries.every((entry) => entry.tokenDataAvailable === true),
    tokenUnavailableAgents: [...unavailableAgents],
    supplementalUsage,
    usageValueAvailable: summaries.some((entry) => entry.usageValueAvailable === true),
    hasUnpricedUsage:
      summaries.some((entry) => entry.hasUnpricedUsage === true) ||
      summaries.some((entry) => entry.usageValueAvailable !== true)
  }
}

// Why: one host that predates ranged reads answers with all-time usage, so a
// mixed answer reports no single range instead of mislabelling the window.
function mergedUsageRange(
  summaries: readonly RuntimeStatsSummary[]
): RuntimeStatsSummary['usageRange'] {
  const [first, ...rest] = summaries
  const range = first?.usageRange
  return range !== undefined && rest.every((summary) => summary.usageRange === range)
    ? range
    : undefined
}

function isAiVaultAgent(value: unknown): value is AiVaultAgent {
  return typeof value === 'string' && AI_VAULT_AGENT_SET.has(value)
}
