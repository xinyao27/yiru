import type { ClaudeUsageSnapshot } from '../claude-usage-types'
import type { CodexUsageSnapshot } from '../codex-usage-types'
import type { OpenCodeUsageSnapshot } from '../opencode-usage-types'

export type UsageValueModel = {
  key: string
  label: string
  tokens: number
  valueUsd: number | null
}

export type UsageValueDay = {
  day: string
  tokens: number
  valueUsd: number | null
  unpricedTokens: number
}

export type UsageValueSnapshot = {
  daily: UsageValueDay[]
  hasUnpricedUsage: boolean
  hasValue: boolean
  models: UsageValueModel[]
}

export type UsageValueInput = {
  claude: Pick<ClaudeUsageSnapshot, 'daily' | 'modelBreakdown'>
  codex: Pick<CodexUsageSnapshot, 'daily' | 'modelBreakdown'>
  openCode: Pick<OpenCodeUsageSnapshot, 'daily' | 'modelBreakdown'>
}

type ModelAccumulator = {
  key: string
  label: string
  tokens: number
  knownValueUsd: number
  hasKnownValue: boolean
}

export function buildUsageValueSnapshot({
  claude,
  codex,
  openCode
}: UsageValueInput): UsageValueSnapshot {
  const models = mergeModelUsage([
    ...claude.modelBreakdown.map((model) => ({
      key: model.key,
      label: model.label,
      tokens:
        model.inputTokens + model.outputTokens + model.cacheReadTokens + model.cacheWriteTokens,
      valueUsd: model.estimatedCostUsd
    })),
    ...codex.modelBreakdown.map((model) => ({
      key: model.key,
      label: model.label,
      tokens: model.totalTokens,
      valueUsd: model.estimatedCostUsd
    })),
    ...openCode.modelBreakdown.map((model) => ({
      key: model.key,
      label: model.label,
      tokens: model.totalTokens,
      valueUsd: null
    }))
  ])
  const daily = mergeDailyUsage([
    ...claude.daily.map((point) => ({
      day: point.day,
      tokens:
        point.inputTokens + point.outputTokens + point.cacheReadTokens + point.cacheWriteTokens,
      valueUsd: point.estimatedCostUsd,
      unpricedTokens: point.unpricedTokens
    })),
    ...codex.daily.map((point) => ({
      day: point.day,
      tokens: point.totalTokens,
      valueUsd: point.estimatedCostUsd,
      unpricedTokens: point.unpricedTokens
    })),
    ...openCode.daily.map((point) => ({
      day: point.day,
      tokens: point.totalTokens,
      valueUsd: null,
      unpricedTokens: point.totalTokens
    }))
  ])
  return {
    daily,
    hasUnpricedUsage:
      daily.some((point) => point.unpricedTokens > 0) ||
      models.some((model) => model.tokens > 0 && model.valueUsd === null),
    hasValue:
      daily.some((point) => point.valueUsd !== null) ||
      models.some((model) => model.valueUsd !== null),
    models
  }
}

function mergeDailyUsage(points: UsageValueDay[]): UsageValueDay[] {
  const byDay = new Map<string, UsageValueDay>()
  for (const point of points) {
    const current = byDay.get(point.day) ?? {
      day: point.day,
      tokens: 0,
      valueUsd: null,
      unpricedTokens: 0
    }
    current.tokens += point.tokens
    current.unpricedTokens += point.unpricedTokens
    if (point.valueUsd !== null) {
      current.valueUsd = (current.valueUsd ?? 0) + point.valueUsd
    }
    byDay.set(point.day, current)
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day))
}

function mergeModelUsage(models: UsageValueModel[]): UsageValueModel[] {
  const byModel = new Map<string, ModelAccumulator>()
  for (const model of models) {
    const key = normalizedModelKey(model.label, model.key)
    const current = byModel.get(key) ?? {
      key,
      label: model.label,
      tokens: 0,
      knownValueUsd: 0,
      hasKnownValue: false
    }
    current.tokens += model.tokens
    if (model.valueUsd !== null) {
      current.knownValueUsd += model.valueUsd
      current.hasKnownValue = true
    }
    byModel.set(key, current)
  }
  return [...byModel.values()]
    .map((model) => ({
      key: model.key,
      label: model.label,
      tokens: model.tokens,
      valueUsd: model.hasKnownValue ? model.knownValueUsd : null
    }))
    .sort((left, right) => right.tokens - left.tokens)
}

function normalizedModelKey(label: string, fallback: string): string {
  return label.trim().toLowerCase() || fallback
}
