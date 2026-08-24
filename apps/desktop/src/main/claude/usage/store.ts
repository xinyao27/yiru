import type { Store } from '~main/persistence'
import { loadKnownUsageWorktreesByRepo } from '~main/usage-worktree-metadata'
import type {
  ClaudeUsageBreakdownKind,
  ClaudeUsageBreakdownRow,
  ClaudeUsageDailyPoint,
  ClaudeUsageRange,
  ClaudeUsageScanState,
  ClaudeUsageScope,
  ClaudeUsageSessionRow,
  ClaudeUsageSnapshot,
  ClaudeUsageSummary
} from '~shared/claude-usage-types'

import {
  buildClaudeUsageBreakdown,
  buildClaudeUsageDaily,
  buildClaudeUsageRecentSessions
} from './query-details'
import { buildClaudeUsageSummary } from './query-summary'
import { createWorktreeRefs, scanClaudeUsageFiles } from './scanner'
import {
  getClaudeUsageWorktreeFingerprint,
  loadClaudeUsageState,
  writeClaudeUsageState
} from './store-persistence'
import type { ClaudeUsagePersistedState } from './types'

export { initClaudeUsagePath } from './store-persistence'

const STALE_MS = 5 * 60_000
export class ClaudeUsageStore {
  private scanPromise: Promise<void> | null = null
  private state: ClaudeUsagePersistedState
  private readonly store: Store

  constructor(store: Store) {
    this.store = store
    this.state = loadClaudeUsageState()
  }

  async setEnabled(enabled: boolean): Promise<ClaudeUsageScanState> {
    this.state.scanState.enabled = enabled
    this.persist()
    return this.getScanState()
  }

  getScanState(): ClaudeUsageScanState {
    return {
      ...this.state.scanState,
      isScanning: this.scanPromise !== null,
      hasAnyClaudeData: this.state.sessions.length > 0 || this.state.dailyAggregates.length > 0
    }
  }

  getSnapshot(
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange,
    recentSessionLimit = 10
  ): ClaudeUsageSnapshot {
    return {
      scanState: this.getScanState(),
      summary: buildClaudeUsageSummary(this.state, scope, range),
      daily: buildClaudeUsageDaily(this.state, scope, range),
      modelBreakdown: buildClaudeUsageBreakdown(this.state, scope, range, 'model'),
      projectBreakdown: buildClaudeUsageBreakdown(this.state, scope, range, 'project'),
      recentSessions: buildClaudeUsageRecentSessions(this.state, scope, range, recentSessionLimit)
    }
  }

  async refresh(force = false): Promise<ClaudeUsageScanState> {
    if (!this.state.scanState.enabled) {
      return this.getScanState()
    }
    const currentFingerprint = await this.getCurrentWorktreeFingerprint()
    if (!force && this.state.scanState.lastScanCompletedAt) {
      const ageMs = Date.now() - this.state.scanState.lastScanCompletedAt
      if (ageMs < STALE_MS && this.state.worktreeFingerprint === currentFingerprint) {
        return this.getScanState()
      }
    }
    await this.runScan()
    return this.getScanState()
  }

  async getSummary(scope: ClaudeUsageScope, range: ClaudeUsageRange): Promise<ClaudeUsageSummary> {
    await this.refresh(false)
    return buildClaudeUsageSummary(this.state, scope, range)
  }

  async getDaily(
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange
  ): Promise<ClaudeUsageDailyPoint[]> {
    await this.refresh(false)
    return buildClaudeUsageDaily(this.state, scope, range)
  }

  async getBreakdown(
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange,
    kind: ClaudeUsageBreakdownKind
  ): Promise<ClaudeUsageBreakdownRow[]> {
    await this.refresh(false)
    return buildClaudeUsageBreakdown(this.state, scope, range, kind)
  }

  async getRecentSessions(
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange,
    limit = 12
  ): Promise<ClaudeUsageSessionRow[]> {
    await this.refresh(false)
    return buildClaudeUsageRecentSessions(this.state, scope, range, limit)
  }

  private async runScan(): Promise<void> {
    if (this.scanPromise) {
      await this.scanPromise
      return
    }
    this.state.scanState.lastScanStartedAt = Date.now()
    this.state.scanState.lastScanError = null
    this.persist()
    this.scanPromise = (async () => {
      try {
        const repos = this.store.getRepos()
        const worktreesByRepo = loadKnownUsageWorktreesByRepo(this.store, repos)
        const fingerprint = getClaudeUsageWorktreeFingerprint(worktreesByRepo)
        const result = await scanClaudeUsageFiles(
          createWorktreeRefs(repos, worktreesByRepo),
          this.state.worktreeFingerprint === fingerprint ? this.state.processedFiles : []
        )
        this.state.processedFiles = result.processedFiles
        this.state.sessions = result.sessions
        this.state.dailyAggregates = result.dailyAggregates
        this.state.worktreeFingerprint = fingerprint
        this.state.scanState.lastScanCompletedAt = Date.now()
        this.state.scanState.lastScanError = null
        this.persist()
      } catch (error) {
        this.state.scanState.lastScanError = error instanceof Error ? error.message : String(error)
        this.persist()
      } finally {
        this.scanPromise = null
      }
    })()
    await this.scanPromise
  }

  private async getCurrentWorktreeFingerprint(): Promise<string> {
    const repos = this.store.getRepos()
    return getClaudeUsageWorktreeFingerprint(loadKnownUsageWorktreesByRepo(this.store, repos))
  }

  private persist(): void {
    writeClaudeUsageState(this.state)
  }
}
