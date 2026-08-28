import type {
  OpenCodeUsageBreakdownKind,
  OpenCodeUsageBreakdownRow,
  OpenCodeUsageDailyPoint,
  OpenCodeUsageRange,
  OpenCodeUsageScanState,
  OpenCodeUsageScope,
  OpenCodeUsageSessionRow,
  OpenCodeUsageSnapshot,
  OpenCodeUsageSummary
} from '@yiru/runtime-protocol/workbench/opencode-usage-types'
import type { Store } from '~main/persistence/store'
import { loadKnownUsageWorktreesByRepo, type UsageWorktreeRef } from '~main/stats/worktree-metadata'

import { loadOpenCodeUsageState, writeOpenCodeUsageState } from './persistence'
import {
  buildOpenCodeUsageBreakdown,
  buildOpenCodeUsageDaily,
  buildOpenCodeUsageRecentSessions,
  buildOpenCodeUsageSnapshot,
  buildOpenCodeUsageSummary
} from './projections'
import { createWorktreeRefs, scanOpenCodeUsageDatabases } from './scanner'
import type { OpenCodeUsagePersistedState } from './types'

export { initOpenCodeUsagePath, normalizePersistedState } from './persistence'

const STALE_MS = 5 * 60_000

function getWorktreeFingerprint(worktreesByRepo: Map<string, UsageWorktreeRef[]>): string {
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

export class OpenCodeUsageStore {
  private state: OpenCodeUsagePersistedState
  private readonly store: Store
  private scanPromise: Promise<void> | null = null

  constructor(store: Store) {
    this.store = store
    this.state = loadOpenCodeUsageState()
  }

  async setEnabled(enabled: boolean): Promise<OpenCodeUsageScanState> {
    this.state.scanState.enabled = enabled
    writeOpenCodeUsageState(this.state)
    return this.getScanState()
  }

  getScanState(): OpenCodeUsageScanState {
    return {
      ...this.state.scanState,
      isScanning: this.scanPromise !== null,
      hasAnyOpenCodeData: this.state.sessions.length > 0 || this.state.dailyAggregates.length > 0
    }
  }

  getSnapshot(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange,
    recentSessionLimit = 10
  ): OpenCodeUsageSnapshot {
    return buildOpenCodeUsageSnapshot(
      this.state,
      this.getScanState(),
      scope,
      range,
      recentSessionLimit
    )
  }

  async refresh(force = false): Promise<OpenCodeUsageScanState> {
    if (!this.state.scanState.enabled) {
      return this.getScanState()
    }
    const fingerprint = await this.getCurrentWorktreeFingerprint()
    if (!force && this.state.scanState.lastScanCompletedAt) {
      const ageMs = Date.now() - this.state.scanState.lastScanCompletedAt
      if (ageMs < STALE_MS && this.state.worktreeFingerprint === fingerprint) {
        return this.getScanState()
      }
    }
    await this.runScan()
    return this.getScanState()
  }

  private async runScan(): Promise<void> {
    if (this.scanPromise) {
      await this.scanPromise
      return
    }
    this.state.scanState.lastScanStartedAt = Date.now()
    this.state.scanState.lastScanError = null
    writeOpenCodeUsageState(this.state)

    this.scanPromise = (async () => {
      try {
        const repos = this.store.getRepos()
        const worktreesByRepo = loadKnownUsageWorktreesByRepo(this.store, repos)
        const fingerprint = getWorktreeFingerprint(worktreesByRepo)
        const result = await scanOpenCodeUsageDatabases(
          createWorktreeRefs(repos, worktreesByRepo),
          this.state.worktreeFingerprint === fingerprint ? this.state.processedDatabases : []
        )
        this.state.processedDatabases = result.processedDatabases
        this.state.sessions = result.sessions
        this.state.dailyAggregates = result.dailyAggregates
        this.state.worktreeFingerprint = fingerprint
        this.state.scanState.lastScanCompletedAt = Date.now()
        this.state.scanState.lastScanError = null
        writeOpenCodeUsageState(this.state)
      } catch (error) {
        this.state.scanState.lastScanError = error instanceof Error ? error.message : String(error)
        writeOpenCodeUsageState(this.state)
      } finally {
        this.scanPromise = null
      }
    })()
    await this.scanPromise
  }

  async getSummary(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange
  ): Promise<OpenCodeUsageSummary> {
    await this.refresh(false)
    return buildOpenCodeUsageSummary(this.state, scope, range)
  }

  async getDaily(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange
  ): Promise<OpenCodeUsageDailyPoint[]> {
    await this.refresh(false)
    return buildOpenCodeUsageDaily(this.state, scope, range)
  }

  async getBreakdown(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange,
    kind: OpenCodeUsageBreakdownKind
  ): Promise<OpenCodeUsageBreakdownRow[]> {
    await this.refresh(false)
    return buildOpenCodeUsageBreakdown(this.state, scope, range, kind)
  }

  async getRecentSessions(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange,
    limit = 10
  ): Promise<OpenCodeUsageSessionRow[]> {
    await this.refresh(false)
    return buildOpenCodeUsageRecentSessions(this.state, scope, range, limit)
  }

  private async getCurrentWorktreeFingerprint(): Promise<string> {
    const repos = this.store.getRepos()
    return getWorktreeFingerprint(loadKnownUsageWorktreesByRepo(this.store, repos))
  }
}
