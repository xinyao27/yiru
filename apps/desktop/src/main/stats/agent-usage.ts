import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { RuntimeStatsSupplementalUsage } from '@yiru/runtime-protocol/mobile-runtime-types'
import {
  AI_VAULT_AGENT_LABELS,
  type AiVaultAgent,
  type AiVaultSession,
  type AiVaultSessionTokenUsage
} from '@yiru/workbench-model/agent'

import { priceClaudeUsage } from '../claude/usage/pricing'
import { priceCodexUsage } from '../codex/usage/pricing'

const DEDICATED_USAGE_AGENTS = new Set<AiVaultAgent>(['claude', 'codex', 'cursor', 'opencode'])

type ModelAccumulator = {
  key: string
  label: string
  tokens: number
  knownValueUsd: number
  hasKnownValue: boolean
  unpricedTokens: number
}

type DailyAccumulator = {
  day: string
  tokens: number
  knownValueUsd: number
  hasKnownValue: boolean
  unpricedTokens: number
}

type TokenPrice = {
  costUsd: number | null
  unpricedTokens: number
}

export function buildSupplementalAgentUsage(
  sessions: readonly AiVaultSession[],
  scopePaths: readonly string[]
): RuntimeStatsSupplementalUsage {
  const dailyUsage = new Map<string, DailyAccumulator>()
  const models = new Map<string, ModelAccumulator>()

  for (const session of sessions) {
    if (
      DEDICATED_USAGE_AGENTS.has(session.agent) ||
      !isSessionWithinUsageScope(session, scopePaths)
    ) {
      continue
    }
    if (!addDetailedUsage(session, dailyUsage, models)) {
      addUnpricedSessionUsage(session, dailyUsage, models)
    }
  }

  return {
    dailyTokens: [...dailyUsage.values()]
      .map((point) => ({
        day: point.day,
        tokens: point.tokens,
        valueUsd: point.hasKnownValue && point.unpricedTokens === 0 ? point.knownValueUsd : null,
        unpricedTokens: point.unpricedTokens
      }))
      .sort((left, right) => left.day.localeCompare(right.day)),
    modelUsage: [...models.values()]
      .map((model) => ({
        key: model.key,
        label: model.label,
        tokens: model.tokens,
        valueUsd: model.hasKnownValue && model.unpricedTokens === 0 ? model.knownValueUsd : null
      }))
      .sort((left, right) => right.tokens - left.tokens)
  }
}

function addDetailedUsage(
  session: AiVaultSession,
  dailyUsage: Map<string, DailyAccumulator>,
  models: Map<string, ModelAccumulator>
): boolean {
  const usages = session.tokenUsage ?? []
  if (usages.length === 0 || usages.some((usage) => usage.timestamp === null)) {
    return false
  }
  const days = usages.map((usage) => localCalendarDay(usage.timestamp))
  if (days.some((day) => day === null)) {
    return false
  }
  let addedTokens = 0
  for (const [index, usage] of usages.entries()) {
    const day = days[index]
    if (day === null || day === undefined) {
      return false
    }
    const price = priceTokenUsage(session.agent, usage)
    addDailyUsage(dailyUsage, day, usage.totalTokens, price)
    addModelUsage(models, session.agent, usage, price)
    addedTokens += usage.totalTokens
  }
  return addedTokens > 0
}

function addUnpricedSessionUsage(
  session: AiVaultSession,
  dailyUsage: Map<string, DailyAccumulator>,
  models: Map<string, ModelAccumulator>
): void {
  const sessionTokens = (session.tokensByDay ?? []).filter(
    (entry) => Number.isFinite(entry.tokens) && entry.tokens > 0
  )
  const totalTokens = sessionTokens.reduce((sum, entry) => sum + entry.tokens, 0)
  if (totalTokens <= 0) {
    return
  }
  for (const entry of sessionTokens) {
    addDailyUsage(dailyUsage, entry.day, entry.tokens, {
      costUsd: null,
      unpricedTokens: entry.tokens
    })
  }
  addModelUsage(
    models,
    session.agent,
    {
      provider: null,
      model: session.model,
      timestamp: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens
    },
    { costUsd: null, unpricedTokens: totalTokens }
  )
}

function priceTokenUsage(agent: AiVaultAgent, usage: AiVaultSessionTokenUsage): TokenPrice {
  const categoryTokens =
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const residualTokens = Math.max(usage.totalTokens - categoryTokens, 0)
  const provider = usage.provider?.trim().toLowerCase()
  // Why: CodexBar folds Pi and OMP sessions into Claude/Codex cost only; the
  // other message-graph agent remains token-only even when it names a provider.
  if ((agent !== 'pi' && agent !== 'omp') || !provider) {
    return { costUsd: null, unpricedTokens: usage.totalTokens }
  }
  if (provider === 'anthropic') {
    const price = priceClaudeUsage({
      model: usage.model,
      timestamp: usage.timestamp ?? undefined,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      // Why: Pi/OMP expose cache creation but not its retention window; the
      // pricing function bills the remainder as five-minute cache creation.
      cacheWrite1hTokens: 0
    })
    return {
      costUsd: price.estimatedCostUsd,
      unpricedTokens: price.unpricedTokens + residualTokens
    }
  }
  if (provider === 'openai-codex') {
    const costUsd = priceCodexUsage(
      usage.model,
      usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
      usage.outputTokens
    )
    return {
      costUsd,
      unpricedTokens: costUsd === null ? usage.totalTokens : residualTokens
    }
  }
  return { costUsd: null, unpricedTokens: usage.totalTokens }
}

function addDailyUsage(
  dailyUsage: Map<string, DailyAccumulator>,
  day: string,
  tokens: number,
  price: TokenPrice
): void {
  const current = dailyUsage.get(day) ?? {
    day,
    tokens: 0,
    knownValueUsd: 0,
    hasKnownValue: false,
    unpricedTokens: 0
  }
  current.tokens += tokens
  current.unpricedTokens += price.unpricedTokens
  if (price.costUsd !== null) {
    current.knownValueUsd += price.costUsd
    current.hasKnownValue = true
  }
  dailyUsage.set(day, current)
}

function addModelUsage(
  models: Map<string, ModelAccumulator>,
  agent: AiVaultAgent,
  usage: AiVaultSessionTokenUsage,
  price: TokenPrice
): void {
  const modelName = usage.model?.trim() || null
  const providerName = usage.provider?.trim() || null
  const providerKey = providerName?.toLowerCase() || 'unknown'
  const modelKey = modelName?.toLowerCase() || 'unknown'
  const key = `ai-vault:${agent}:${providerKey}:${modelKey}`
  const labelParts = [AI_VAULT_AGENT_LABELS[agent], providerName, modelName].filter(
    (part): part is string => Boolean(part)
  )
  const current = models.get(key) ?? {
    key,
    label: labelParts.join(' · '),
    tokens: 0,
    knownValueUsd: 0,
    hasKnownValue: false,
    unpricedTokens: 0
  }
  current.tokens += usage.totalTokens
  current.unpricedTokens += price.unpricedTokens
  if (price.costUsd !== null) {
    current.knownValueUsd += price.costUsd
    current.hasKnownValue = true
  }
  models.set(key, current)
}

function localCalendarDay(timestamp: string | null): string | null {
  if (!timestamp) {
    return null
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSessionWithinUsageScope(
  session: Pick<AiVaultSession, 'cwd'>,
  scopePaths: readonly string[]
): boolean {
  const cwd = session.cwd
  if (!cwd || scopePaths.length === 0) {
    return false
  }
  return scopePaths.some((scopePath) => isPathWithin(scopePath, cwd))
}

function isPathWithin(scopePath: string, candidatePath: string): boolean {
  const relation = relative(resolve(scopePath), resolve(candidatePath))
  return (
    relation === '' ||
    (!isAbsolute(relation) && relation !== '..' && !relation.startsWith(`..${sep}`))
  )
}
