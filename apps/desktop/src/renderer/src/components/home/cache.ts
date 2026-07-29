import type { ContributionPoint } from '@yiru/workbench-model/ui'

import type { StatsSummary } from '../../../../shared/types'
import type { ModelUsageValue, UsageValue } from './usage-value'

const HOME_DATA_CACHE_KEY = 'yiru.home.data-cache.v1'
const HOME_DATA_CACHE_SCHEMA_VERSION = 1

export type HomeCachedUsageValue = Pick<
  UsageValue,
  'dailyTokens' | 'dailyValues' | 'hasUnpricedUsage' | 'hasValue' | 'models'
>

export type HomeDataSnapshot = {
  stats: StatsSummary
  usage: HomeCachedUsageValue
}

export function loadHomeDataSnapshot(): HomeDataSnapshot | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null
    }
    const raw = window.localStorage.getItem(HOME_DATA_CACHE_KEY)
    if (!raw) {
      return null
    }
    return parseHomeDataSnapshot(JSON.parse(raw))
  } catch {
    // Why: storage can be unavailable or corrupt; Home should fall back to its
    // normal live loading path instead of making the landing page unavailable.
    return null
  }
}

export function saveHomeDataSnapshot(stats: StatsSummary, usage: UsageValue): void {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return
    }
    const persisted = JSON.stringify({
      schemaVersion: HOME_DATA_CACHE_SCHEMA_VERSION,
      stats: {
        totalAgentsSpawned: stats.totalAgentsSpawned,
        totalPRsCreated: stats.totalPRsCreated,
        totalAgentTimeMs: stats.totalAgentTimeMs,
        firstEventAt: stats.firstEventAt,
        dailyActivity: stats.dailyActivity ?? []
      },
      usage: {
        dailyTokens: usage.dailyTokens,
        dailyValues: usage.dailyValues,
        hasUnpricedUsage: usage.hasUnpricedUsage,
        hasValue: usage.hasValue,
        models: usage.models
      }
    })
    if (window.localStorage.getItem(HOME_DATA_CACHE_KEY) !== persisted) {
      window.localStorage.setItem(HOME_DATA_CACHE_KEY, persisted)
    }
  } catch {
    // Why: a failed cache write must not affect the authoritative live data.
  }
}

function parseHomeDataSnapshot(value: unknown): HomeDataSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== HOME_DATA_CACHE_SCHEMA_VERSION) {
    return null
  }
  const stats = parseStatsSummary(value.stats)
  const usage = parseUsageValue(value.usage)
  return stats && usage ? { stats, usage } : null
}

function parseStatsSummary(value: unknown): StatsSummary | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.totalAgentsSpawned) ||
    !isFiniteNumber(value.totalPRsCreated) ||
    !isFiniteNumber(value.totalAgentTimeMs) ||
    (value.firstEventAt !== null && !isFiniteNumber(value.firstEventAt))
  ) {
    return null
  }
  const dailyActivity = parseDailyActivity(value.dailyActivity)
  if (!dailyActivity) {
    return null
  }
  return {
    totalAgentsSpawned: value.totalAgentsSpawned,
    totalPRsCreated: value.totalPRsCreated,
    totalAgentTimeMs: value.totalAgentTimeMs,
    firstEventAt: value.firstEventAt,
    dailyActivity
  }
}

function parseUsageValue(value: unknown): HomeCachedUsageValue | null {
  if (
    !isRecord(value) ||
    typeof value.hasUnpricedUsage !== 'boolean' ||
    typeof value.hasValue !== 'boolean'
  ) {
    return null
  }
  const dailyTokens = parseContributionPoints(value.dailyTokens)
  const dailyValues = parseContributionPoints(value.dailyValues)
  const models = parseModels(value.models)
  if (!dailyTokens || !dailyValues || !models) {
    return null
  }
  return {
    dailyTokens,
    dailyValues,
    hasUnpricedUsage: value.hasUnpricedUsage,
    hasValue: value.hasValue,
    models
  }
}

function parseDailyActivity(value: unknown): NonNullable<StatsSummary['dailyActivity']> | null {
  if (!Array.isArray(value)) {
    return null
  }
  const entries: NonNullable<StatsSummary['dailyActivity']> = []
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.day !== 'string' ||
      !isFiniteNumber(entry.agentStarts) ||
      !isFiniteNumber(entry.prsCreated)
    ) {
      return null
    }
    entries.push({
      day: entry.day,
      agentStarts: entry.agentStarts,
      prsCreated: entry.prsCreated
    })
  }
  return entries
}

function parseContributionPoints(value: unknown): ContributionPoint[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const points: ContributionPoint[] = []
  for (const point of value) {
    if (!isRecord(point) || typeof point.day !== 'string' || !isFiniteNumber(point.value)) {
      return null
    }
    points.push({ day: point.day, value: point.value })
  }
  return points
}

function parseModels(value: unknown): ModelUsageValue[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const models: ModelUsageValue[] = []
  for (const model of value) {
    if (
      !isRecord(model) ||
      typeof model.key !== 'string' ||
      typeof model.label !== 'string' ||
      !isFiniteNumber(model.tokens) ||
      (model.valueUsd !== null && !isFiniteNumber(model.valueUsd))
    ) {
      return null
    }
    models.push({
      key: model.key,
      label: model.label,
      tokens: model.tokens,
      valueUsd: model.valueUsd
    })
  }
  return models
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
