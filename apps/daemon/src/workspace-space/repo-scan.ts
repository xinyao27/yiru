import { isFolderRepo } from '@yiru/runtime-protocol/workbench/repo-kind'
import type { GitWorktreeInfo, Repo, Worktree } from '@yiru/runtime-protocol/workbench/types'
import type {
  WorkspaceSpaceScanProgress,
  WorkspaceSpaceScanStatus
} from '@yiru/runtime-protocol/workbench/workspace/space-types'

import { createFolderWorktree, listRepoWorktrees } from '../projects/worktrees'
import { mergeWorktree } from '../worktree/logic'
import {
  mapWorkspaceSpaceWithLimit,
  throwIfWorkspaceSpaceScanAborted,
  WorkspaceSpaceScanCancelledError
} from './cancellation'
import { scanLocalWorktree } from './local-scan'
import {
  classifyWorkspaceSpaceError,
  type RepoScanResult,
  type WorkspaceSpaceAnalyzeOptions,
  type WorkspaceSpaceScanLimiters,
  type WorkspaceSpaceStore
} from './rows'

const WORKTREE_SCAN_CONCURRENCY = 3

type WorktreeListResult =
  | { ok: true; worktrees: GitWorktreeInfo[] }
  | { ok: false; status: Exclude<WorkspaceSpaceScanStatus, 'ok'>; error: string }

async function listWorktreesForSpaceScan(
  repo: Repo,
  signal?: AbortSignal
): Promise<WorktreeListResult> {
  try {
    throwIfWorkspaceSpaceScanAborted(signal)
    const worktrees = isFolderRepo(repo)
      ? [createFolderWorktree(repo)]
      : await listRepoWorktrees(repo)
    throwIfWorkspaceSpaceScanAborted(signal)
    return { ok: true, worktrees }
  } catch (error) {
    if (error instanceof WorkspaceSpaceScanCancelledError) {
      throw error
    }
    const classified = classifyWorkspaceSpaceError(error)
    return { ok: false, status: classified.status, error: classified.message }
  }
}

function mergeForSpaceScan(
  repo: Repo,
  gitWorktree: GitWorktreeInfo,
  store: WorkspaceSpaceStore
): Worktree {
  const worktreeId = `${repo.id}::${gitWorktree.path}`
  return mergeWorktree(repo.id, gitWorktree, store.getWorktreeMeta(worktreeId), repo.displayName)
}

function reportProgress(
  progress: WorkspaceSpaceScanProgress,
  updates: Partial<WorkspaceSpaceScanProgress>,
  onProgress: WorkspaceSpaceAnalyzeOptions['onProgress']
): void {
  Object.assign(progress, updates, { updatedAt: Date.now() })
  onProgress?.({ ...progress })
}

export async function scanWorkspaceSpaceRepo(
  repo: Repo,
  scannedAt: number,
  store: WorkspaceSpaceStore,
  limiters: WorkspaceSpaceScanLimiters,
  progress: WorkspaceSpaceScanProgress,
  options: WorkspaceSpaceAnalyzeOptions
): Promise<RepoScanResult> {
  throwIfWorkspaceSpaceScanAborted(options.signal)
  reportProgress(
    progress,
    { currentRepoDisplayName: repo.displayName, currentWorktreeDisplayName: null },
    options.onProgress
  )
  const listed = await listWorktreesForSpaceScan(repo, options.signal)
  if (!listed.ok) {
    reportProgress(
      progress,
      { scannedRepoCount: progress.scannedRepoCount + 1 },
      options.onProgress
    )
    return {
      worktrees: [],
      summary: {
        repoId: repo.id,
        displayName: repo.displayName,
        path: repo.path,
        isRemote: false,
        worktreeCount: 0,
        scannedWorktreeCount: 0,
        unavailableWorktreeCount: 1,
        totalSizeBytes: 0,
        reclaimableBytes: 0,
        error: listed.error
      }
    }
  }
  // Why: prunable registrations have no directory to size or reclaim; removal
  // flows enumerate worktrees separately and still retain access to them.
  const worktrees = listed.worktrees
    .filter((gitWorktree) => !gitWorktree.prunable)
    .map((gitWorktree) => mergeForSpaceScan(repo, gitWorktree, store))
  reportProgress(
    progress,
    { totalWorktreeCount: progress.totalWorktreeCount + worktrees.length },
    options.onProgress
  )
  const rows = await mapWorkspaceSpaceWithLimit(
    worktrees,
    WORKTREE_SCAN_CONCURRENCY,
    async (worktree) => {
      throwIfWorkspaceSpaceScanAborted(options.signal)
      reportProgress(
        progress,
        {
          currentRepoDisplayName: repo.displayName,
          currentWorktreeDisplayName: worktree.displayName
        },
        options.onProgress
      )
      const row = await limiters.localWorktree(() =>
        scanLocalWorktree(repo, worktree, scannedAt, options.signal)
      )
      reportProgress(
        progress,
        { scannedWorktreeCount: progress.scannedWorktreeCount + 1 },
        options.onProgress
      )
      return row
    }
  )
  reportProgress(
    progress,
    {
      scannedRepoCount: progress.scannedRepoCount + 1,
      currentRepoDisplayName: repo.displayName,
      currentWorktreeDisplayName: null
    },
    options.onProgress
  )
  return {
    worktrees: rows,
    summary: {
      repoId: repo.id,
      displayName: repo.displayName,
      path: repo.path,
      isRemote: false,
      worktreeCount: rows.length,
      scannedWorktreeCount: rows.filter((row) => row.status === 'ok').length,
      unavailableWorktreeCount: rows.filter((row) => row.status !== 'ok').length,
      totalSizeBytes: rows.reduce((sum, row) => sum + row.sizeBytes, 0),
      reclaimableBytes: rows.reduce((sum, row) => sum + row.reclaimableBytes, 0),
      error: null
    }
  }
}
