import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'

import { decodeCodexUsagePersistedState, encodeCodexUsagePersistedState } from './persistence'
import type { CodexUsagePersistedState } from './types'

const SCHEMA_VERSION = 10

let codexUsageFile: string | null = null
let codexUsageOwnershipFile: string | null = null

export function initCodexUsagePath(): void {
  const userDataPath = getRuntimeHostPathsProvider().userDataPath()
  codexUsageFile = join(userDataPath, 'yiru-codex-usage.json')
  codexUsageOwnershipFile = join(userDataPath, 'yiru-codex-usage-ownership.sqlite')
}

export function getCodexUsageOwnershipFile(): string {
  codexUsageOwnershipFile ??= join(
    getRuntimeHostPathsProvider().userDataPath(),
    'yiru-codex-usage-ownership.sqlite'
  )
  return codexUsageOwnershipFile
}

export function createDefaultCodexUsageState(): CodexUsagePersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    worktreeFingerprint: null,
    ownershipGeneration: null,
    processedFiles: [],
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

export function normalizePersistedState(state: CodexUsagePersistedState): CodexUsagePersistedState {
  if (state.schemaVersion !== SCHEMA_VERSION) {
    // Why: schema changes affect dedupe, attribution, or request pricing; old
    // aggregates cannot be safely patched into current analytics.
    return createDefaultCodexUsageState()
  }
  return {
    ...state,
    scanState: { ...state.scanState, enabled: true },
    sessions: state.sessions.map((session) => ({
      ...session,
      locationModelBreakdown: session.locationModelBreakdown ?? []
    }))
  }
}

export function loadCodexUsageState(): {
  state: CodexUsagePersistedState
  shouldCompact: boolean
} {
  try {
    const usageFile = getCodexUsageFile()
    if (!existsSync(usageFile)) {
      return { state: createDefaultCodexUsageState(), shouldCompact: false }
    }
    const parsed = decodeCodexUsagePersistedState(readFileSync(usageFile, 'utf-8'))
    const defaults = createDefaultCodexUsageState()
    return {
      state: normalizePersistedState({
        ...defaults,
        ...parsed,
        scanState: { ...defaults.scanState, ...parsed.scanState }
      }),
      shouldCompact: parsed.schemaVersion !== SCHEMA_VERSION
    }
  } catch (error) {
    console.error('[codex-usage] Failed to load persisted state, starting fresh:', error)
    return { state: createDefaultCodexUsageState(), shouldCompact: false }
  }
}

export function writeCodexUsageState(state: CodexUsagePersistedState): void {
  const usageFile = getCodexUsageFile()
  const directory = dirname(usageFile)
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
  const tmpFile = `${usageFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  writeFileSync(tmpFile, encodeCodexUsagePersistedState(state), 'utf-8')
  renameSync(tmpFile, usageFile)
}

function getCodexUsageFile(): string {
  codexUsageFile ??= join(getRuntimeHostPathsProvider().userDataPath(), 'yiru-codex-usage.json')
  return codexUsageFile
}
