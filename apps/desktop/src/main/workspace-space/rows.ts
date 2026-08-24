import type { Repo, Worktree } from '~shared/types'
import type { WorkspaceSpaceEntryScan } from '~shared/workspace/entry-traversal'
import type {
  WorkspaceSpaceItem,
  WorkspaceSpaceRepoSummary,
  WorkspaceSpaceScanProgress,
  WorkspaceSpaceScanStatus,
  WorkspaceSpaceWorktree
} from '~shared/workspace/space-types'

import type { Store } from '../persistence'
import type { AsyncLimiter } from './cancellation'

export type WorkspaceSpaceStore = Pick<Store, 'getRepos' | 'getWorktreeMeta'>
export type WorkspaceSpaceAnalyzeOptions = {
  signal?: AbortSignal
  scanId?: string
  onProgress?: (progress: WorkspaceSpaceScanProgress) => void
}
export type WorkspaceSpaceScanLimiters = { localWorktree: AsyncLimiter }
export type RepoScanResult = {
  summary: WorkspaceSpaceRepoSummary
  worktrees: WorkspaceSpaceWorktree[]
}
export type WorkspaceSpaceScanStats = WorkspaceSpaceEntryScan

export function classifyWorkspaceSpaceError(error: unknown): {
  status: Exclude<WorkspaceSpaceScanStatus, 'ok'>
  message: string
} {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return { status: 'missing', message }
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return { status: 'permission-denied', message }
  }
  return { status: 'error', message }
}

export function toWorkspaceSpaceItem(stats: WorkspaceSpaceScanStats): WorkspaceSpaceItem {
  return { name: stats.name, path: stats.path, kind: stats.kind, sizeBytes: stats.sizeBytes }
}

export function createBaseWorktreeRow(
  repo: Repo,
  worktree: Worktree,
  scannedAt: number
): Omit<
  WorkspaceSpaceWorktree,
  | 'status'
  | 'error'
  | 'sizeBytes'
  | 'reclaimableBytes'
  | 'skippedEntryCount'
  | 'topLevelItems'
  | 'omittedTopLevelItemCount'
  | 'omittedTopLevelSizeBytes'
> {
  return {
    worktreeId: worktree.id,
    repoId: repo.id,
    repoDisplayName: repo.displayName,
    repoPath: repo.path,
    displayName: worktree.displayName,
    path: worktree.path,
    branch: worktree.branch,
    isMainWorktree: worktree.isMainWorktree,
    isRemote: false,
    isSparse: worktree.isSparse === true,
    canDelete: !worktree.isMainWorktree,
    lastActivityAt: worktree.lastActivityAt,
    scannedAt
  }
}

export function createUnavailableWorktreeRow(
  repo: Repo,
  worktree: Worktree,
  scannedAt: number,
  status: Exclude<WorkspaceSpaceScanStatus, 'ok'>,
  error: string
): WorkspaceSpaceWorktree {
  return {
    ...createBaseWorktreeRow(repo, worktree, scannedAt),
    status,
    error,
    sizeBytes: 0,
    reclaimableBytes: 0,
    skippedEntryCount: 0,
    topLevelItems: [],
    omittedTopLevelItemCount: 0,
    omittedTopLevelSizeBytes: 0
  }
}
