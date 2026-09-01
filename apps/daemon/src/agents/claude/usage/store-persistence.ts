import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'
import type { UsageWorktreeRef } from '~main/stats/worktree-metadata'

import type { ClaudeUsagePersistedState } from './types'

// Why: v7 excludes Vertex AI pricing and normalizes negative tokens.
const SCHEMA_VERSION = 7
let claudeUsageFile: string | null = null

function getDefaultState(): ClaudeUsagePersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    worktreeFingerprint: null,
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

export function initClaudeUsagePath(): void {
  claudeUsageFile = join(getRuntimeHostPathsProvider().userDataPath(), 'yiru-claude-usage.json')
}

function getClaudeUsageFile(): string {
  if (!claudeUsageFile) {
    initClaudeUsagePath()
  }
  return (
    claudeUsageFile ?? join(getRuntimeHostPathsProvider().userDataPath(), 'yiru-claude-usage.json')
  )
}

export function loadClaudeUsageState(): ClaudeUsagePersistedState {
  try {
    const usageFile = getClaudeUsageFile()
    if (!existsSync(usageFile)) {
      return getDefaultState()
    }
    const parsed = JSON.parse(readFileSync(usageFile, 'utf-8')) as ClaudeUsagePersistedState
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      // Why: scanner semantics affect totals, so incompatible analytics caches
      // are rebuilt rather than briefly exposing stale pricing.
      return getDefaultState()
    }
    const defaults = getDefaultState()
    return {
      ...defaults,
      ...parsed,
      scanState: { ...defaults.scanState, ...parsed.scanState, enabled: true }
    }
  } catch (error) {
    // Why: corrupt analytics must not prevent the workspace from booting; keep
    // the original file on disk for diagnosis and rebuild in memory.
    console.error('[claude-usage] Failed to load persisted state, starting fresh:', error)
    return getDefaultState()
  }
}

export function writeClaudeUsageState(state: ClaudeUsagePersistedState): void {
  const usageFile = getClaudeUsageFile()
  const directory = dirname(usageFile)
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
  // Why: scans refresh during active use; atomic rename prevents a crash from
  // leaving a truncated cache as the common failure mode.
  const temporaryFile = `${usageFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  writeFileSync(temporaryFile, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(temporaryFile, usageFile)
}

export function getClaudeUsageWorktreeFingerprint(
  worktreesByRepo: Map<string, UsageWorktreeRef[]>
): string {
  const rows = [...worktreesByRepo.entries()]
    .flatMap(([repoId, worktrees]) =>
      worktrees.map((worktree) =>
        JSON.stringify({
          repoId,
          worktreeId: worktree.worktreeId,
          path: worktree.path,
          displayName: worktree.displayName
        })
      )
    )
    .sort()
  return JSON.stringify(rows)
}
