import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '@yiru/runtime-protocol/model/workspace'
import type {
  WorkspaceSpaceAnalysis,
  WorkspaceSpaceScanProgress
} from '@yiru/runtime-protocol/workbench/workspace/space-types'

import {
  createWorkspaceSpaceLimiter,
  mapWorkspaceSpaceWithLimit,
  throwIfWorkspaceSpaceScanAborted
} from './cancellation'
import { scanWorkspaceSpaceRepo } from './repo-scan'
import type { WorkspaceSpaceAnalyzeOptions, WorkspaceSpaceStore } from './rows'

export { WorkspaceSpaceScanCancelledError } from './cancellation'

const LOCAL_WORKTREE_SCAN_CONCURRENCY = 1
const REPO_SCAN_CONCURRENCY = 2

export async function analyzeWorkspaceSpace(
  store: WorkspaceSpaceStore,
  options: WorkspaceSpaceAnalyzeOptions = {}
): Promise<WorkspaceSpaceAnalysis> {
  throwIfWorkspaceSpaceScanAborted(options.signal)
  const scannedAt = Date.now()
  const reposToScan = store
    .getRepos()
    .filter((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
  const progress: WorkspaceSpaceScanProgress = {
    scanId: options.scanId ?? String(scannedAt),
    state: 'running',
    startedAt: scannedAt,
    updatedAt: scannedAt,
    totalRepoCount: reposToScan.length,
    scannedRepoCount: 0,
    totalWorktreeCount: 0,
    scannedWorktreeCount: 0,
    currentRepoDisplayName: null,
    currentWorktreeDisplayName: null
  }
  options.onProgress?.({ ...progress })
  const limiters = {
    localWorktree: createWorkspaceSpaceLimiter(LOCAL_WORKTREE_SCAN_CONCURRENCY, options.signal)
  }
  const repoResults = await mapWorkspaceSpaceWithLimit(reposToScan, REPO_SCAN_CONCURRENCY, (repo) =>
    scanWorkspaceSpaceRepo(repo, scannedAt, store, limiters, progress, options)
  )
  throwIfWorkspaceSpaceScanAborted(options.signal)
  const repos = repoResults.map((result) => result.summary)
  const worktrees = repoResults
    .flatMap((result) => result.worktrees)
    .sort((left, right) =>
      left.sizeBytes !== right.sizeBytes
        ? right.sizeBytes - left.sizeBytes
        : left.displayName.localeCompare(right.displayName)
    )
  throwIfWorkspaceSpaceScanAborted(options.signal)
  return {
    scannedAt,
    totalSizeBytes: worktrees.reduce((sum, row) => sum + row.sizeBytes, 0),
    reclaimableBytes: worktrees.reduce((sum, row) => sum + row.reclaimableBytes, 0),
    worktreeCount: worktrees.length,
    scannedWorktreeCount: worktrees.filter((row) => row.status === 'ok').length,
    unavailableWorktreeCount:
      worktrees.filter((row) => row.status !== 'ok').length +
      repos.filter((repo) => repo.error !== null).length,
    repos,
    worktrees
  }
}
