import type {
  CodexUsageBreakdownKind,
  CodexUsageBreakdownRow,
  CodexUsageDailyPoint,
  CodexUsageRange,
  CodexUsageScanState,
  CodexUsageScope,
  CodexUsageSessionRow,
  CodexUsageSnapshot,
  CodexUsageSummary
} from '@yiru/runtime-protocol/workbench/codex-usage-types'
import type { Store } from '~main/persistence/store'
import { loadKnownUsageWorktreesByRepo, type UsageWorktreeRef } from '~main/stats/worktree-metadata'

import { buildCodexUsageBreakdown } from './breakdown-query'
import { buildRecentCodexUsageSessions } from './recent-sessions-query'
import { createWorktreeRefs, scanCodexUsageFiles } from './scanner'
import { getCodexUsageOwnershipFile, loadCodexUsageState, writeCodexUsageState } from './storage'
import { buildCodexUsageDaily, buildCodexUsageSummary } from './summary-query'
import type { CodexUsagePersistedState } from './types'

export { initCodexUsagePath, normalizePersistedState } from './storage'

const STALE_MS = 5 * 60_000

export class CodexUsageStore {
  private state: CodexUsagePersistedState
  private readonly store: Store
  private scanPromise: Promise<void> | null = null

  constructor(store: Store) {
    this.store = store
    const loaded = loadCodexUsageState()
    this.state = loaded.state
    if (loaded.shouldCompact) {
      this.writeToDisk()
    }
  }

  async setEnabled(enabled: boolean): Promise<CodexUsageScanState> {
    this.state.scanState.enabled = enabled
    this.writeToDisk()
    return this.getScanState()
  }

  getScanState(): CodexUsageScanState {
    return {
      ...this.state.scanState,
      isScanning: this.scanPromise !== null,
      hasAnyCodexData: this.state.sessions.length > 0 || this.state.dailyAggregates.length > 0
    }
  }

  getSnapshot(
    scope: CodexUsageScope,
    range: CodexUsageRange,
    recentSessionLimit = 10
  ): CodexUsageSnapshot {
    return {
      scanState: this.getScanState(),
      summary: buildCodexUsageSummary(this.state, scope, range),
      daily: buildCodexUsageDaily(this.state, scope, range),
      modelBreakdown: buildCodexUsageBreakdown(this.state, scope, range, 'model'),
      projectBreakdown: buildCodexUsageBreakdown(this.state, scope, range, 'project'),
      recentSessions: buildRecentCodexUsageSessions(this.state, scope, range, recentSessionLimit)
    }
  }

  async refresh(force = false): Promise<CodexUsageScanState> {
    if (!this.state.scanState.enabled) {
      return this.getScanState()
    }
    const worktreeFingerprint = await this.getCurrentWorktreeFingerprint()
    const completedAt = this.state.scanState.lastScanCompletedAt
    if (
      !force &&
      completedAt &&
      Date.now() - completedAt < STALE_MS &&
      this.state.worktreeFingerprint === worktreeFingerprint
    ) {
      return this.getScanState()
    }
    await this.runScan()
    return this.getScanState()
  }

  async getSummary(scope: CodexUsageScope, range: CodexUsageRange): Promise<CodexUsageSummary> {
    await this.refresh(false)
    return buildCodexUsageSummary(this.state, scope, range)
  }

  async getDaily(scope: CodexUsageScope, range: CodexUsageRange): Promise<CodexUsageDailyPoint[]> {
    await this.refresh(false)
    return buildCodexUsageDaily(this.state, scope, range)
  }

  async getBreakdown(
    scope: CodexUsageScope,
    range: CodexUsageRange,
    kind: CodexUsageBreakdownKind
  ): Promise<CodexUsageBreakdownRow[]> {
    await this.refresh(false)
    return buildCodexUsageBreakdown(this.state, scope, range, kind)
  }

  async getRecentSessions(
    scope: CodexUsageScope,
    range: CodexUsageRange,
    limit = 12
  ): Promise<CodexUsageSessionRow[]> {
    await this.refresh(false)
    return buildRecentCodexUsageSessions(this.state, scope, range, limit)
  }

  private async runScan(): Promise<void> {
    if (this.scanPromise) {
      await this.scanPromise
      return
    }
    this.state.scanState.lastScanStartedAt = Date.now()
    this.state.scanState.lastScanError = null
    this.scanPromise = this.scanUsageFiles().finally(() => {
      this.scanPromise = null
    })
    await this.scanPromise
  }

  private async scanUsageFiles(): Promise<void> {
    try {
      const repos = this.store.getRepos()
      const worktreesByRepo = loadKnownUsageWorktreesByRepo(this.store, repos)
      const fingerprint = getWorktreeFingerprint(worktreesByRepo)
      const canReuseProcessedFiles = this.state.worktreeFingerprint === fingerprint
      const result = await scanCodexUsageFiles(
        createWorktreeRefs(repos, worktreesByRepo),
        canReuseProcessedFiles ? this.state.processedFiles : [],
        canReuseProcessedFiles ? this.state.ownershipGeneration : null,
        getCodexUsageOwnershipFile()
      )
      this.state.processedFiles = result.processedFiles
      this.state.sessions = result.sessions
      this.state.dailyAggregates = result.dailyAggregates
      this.state.ownershipGeneration = result.ownershipGeneration
      this.state.worktreeFingerprint = fingerprint
      this.state.scanState.lastScanCompletedAt = Date.now()
      this.state.scanState.lastScanError = null
      this.writeToDisk()
    } catch (error) {
      this.state.scanState.lastScanError = error instanceof Error ? error.message : String(error)
      this.writeToDisk()
    }
  }

  private async getCurrentWorktreeFingerprint(): Promise<string> {
    const repos = this.store.getRepos()
    return getWorktreeFingerprint(loadKnownUsageWorktreesByRepo(this.store, repos))
  }

  private writeToDisk(): void {
    writeCodexUsageState(this.state)
  }
}

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
