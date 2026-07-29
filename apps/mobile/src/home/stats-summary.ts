import type { RuntimeStatsSummary } from '@yiru/runtime-protocol/mobile-runtime-types'
import { AI_VAULT_AGENTS, type AiVaultAgent } from '@yiru/workbench-model/agent'

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
  const tokenUnavailableAgents = Array.isArray(record.tokenUnavailableAgents)
    ? record.tokenUnavailableAgents.filter(isAiVaultAgent)
    : undefined
  return {
    totalAgentsSpawned: record.totalAgentsSpawned,
    totalPRsCreated: record.totalPRsCreated,
    totalAgentTimeMs: record.totalAgentTimeMs,
    firstEventAt: record.firstEventAt,
    dailyActivity,
    dailyTokens,
    tokenDataAvailable:
      typeof record.tokenDataAvailable === 'boolean' ? record.tokenDataAvailable : undefined,
    tokenUnavailableAgents
  }
}

export function aggregateHomeStats(statsByHost: HomeStatsByHost): RuntimeStatsSummary | null {
  const summaries = Object.values(statsByHost)
  if (summaries.length === 0) {
    return null
  }
  const dailyActivity = new Map<string, { agentStarts: number; prsCreated: number }>()
  const dailyTokens = new Map<string, number>()
  const unavailableAgents = new Set<
    NonNullable<RuntimeStatsSummary['tokenUnavailableAgents']>[number]
  >()
  let firstEventAt: number | null = null

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
    tokenDataAvailable: summaries.every((entry) => entry.tokenDataAvailable === true),
    tokenUnavailableAgents: [...unavailableAgents]
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : null
}

function isAiVaultAgent(value: unknown): value is AiVaultAgent {
  return typeof value === 'string' && AI_VAULT_AGENT_SET.has(value)
}
