import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'

import type { OpenCodeUsageDailyAggregate, OpenCodeUsagePersistedState } from './types'

const SCHEMA_VERSION = 4
let openCodeUsageFile: string | null = null

export function getDefaultOpenCodeUsageState(): OpenCodeUsagePersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    worktreeFingerprint: null,
    processedDatabases: [],
    sessions: [],
    dailyAggregates: [],
    scanState: {
      enabled: true,
      lastScanStartedAt: null,
      lastScanCompletedAt: null,
      lastScanError: null
    }
  }
}

function normalizeDailyAggregateCost(
  entry: OpenCodeUsageDailyAggregate
): OpenCodeUsageDailyAggregate {
  return { ...entry, estimatedCostUsd: entry.estimatedCostUsd ?? null }
}

function normalizeSessionCost(
  session: OpenCodeUsagePersistedState['sessions'][number]
): OpenCodeUsagePersistedState['sessions'][number] {
  return {
    ...session,
    estimatedCostUsd: session.estimatedCostUsd ?? null,
    locationBreakdown: (session.locationBreakdown ?? []).map((entry) => ({
      ...entry,
      estimatedCostUsd: entry.estimatedCostUsd ?? null
    })),
    modelBreakdown: (session.modelBreakdown ?? []).map((entry) => ({
      ...entry,
      estimatedCostUsd: entry.estimatedCostUsd ?? null
    })),
    locationModelBreakdown: (session.locationModelBreakdown ?? []).map((entry) => ({
      ...entry,
      estimatedCostUsd: entry.estimatedCostUsd ?? null
    }))
  }
}

export function normalizePersistedState(
  state: OpenCodeUsagePersistedState
): OpenCodeUsagePersistedState {
  if (state.schemaVersion !== SCHEMA_VERSION) {
    return getDefaultOpenCodeUsageState()
  }
  return {
    ...state,
    scanState: { ...state.scanState, enabled: true },
    processedDatabases: (state.processedDatabases ?? []).map((database) => ({
      ...database,
      sessions: (database.sessions ?? []).map(normalizeSessionCost),
      dailyAggregates: (database.dailyAggregates ?? []).map(normalizeDailyAggregateCost)
    })),
    sessions: state.sessions.map(normalizeSessionCost),
    dailyAggregates: state.dailyAggregates.map(normalizeDailyAggregateCost)
  }
}

export function initOpenCodeUsagePath(): void {
  openCodeUsageFile = join(getRuntimeHostPathsProvider().userDataPath(), 'yiru-opencode-usage.json')
}

function getOpenCodeUsageFile(): string {
  openCodeUsageFile ??= join(
    getRuntimeHostPathsProvider().userDataPath(),
    'yiru-opencode-usage.json'
  )
  return openCodeUsageFile
}

export function loadOpenCodeUsageState(): OpenCodeUsagePersistedState {
  try {
    const usageFile = getOpenCodeUsageFile()
    if (!existsSync(usageFile)) {
      return getDefaultOpenCodeUsageState()
    }
    // Why: legacy cache validation is performed by schema normalization below;
    // malformed shapes are caught and replaced by a fresh state.
    const parsed = JSON.parse(readFileSync(usageFile, 'utf-8')) as OpenCodeUsagePersistedState
    const defaults = getDefaultOpenCodeUsageState()
    return normalizePersistedState({
      ...defaults,
      ...parsed,
      scanState: { ...defaults.scanState, ...parsed.scanState }
    })
  } catch (error) {
    console.error('[opencode-usage] Failed to load persisted state, starting fresh:', error)
    return getDefaultOpenCodeUsageState()
  }
}

export function writeOpenCodeUsageState(state: OpenCodeUsagePersistedState): void {
  const usageFile = getOpenCodeUsageFile()
  const directory = dirname(usageFile)
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
  const tempFile = `${usageFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(tempFile, usageFile)
}
