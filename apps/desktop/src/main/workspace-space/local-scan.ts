import type { Dirent } from 'node:fs'
import { lstat, opendir } from 'node:fs/promises'
import { platform } from 'node:process'

import type { Repo, Worktree } from '~shared/types'
import {
  scanWorkspaceSpaceEntryTree,
  type WorkspaceSpaceEntryScan
} from '~shared/workspace/entry-traversal'
import {
  collectWorkspaceSpaceDirectoryEntries,
  createWorkspaceSpaceScanBudget,
  WorkspaceSpaceScanCapacityError
} from '~shared/workspace/scan-budget'
import { compactWorkspaceSpaceItems } from '~shared/workspace/space-compaction'
import type { WorkspaceSpaceWorktree } from '~shared/workspace/space-types'

import {
  mapWorkspaceSpaceWithLimit,
  throwIfWorkspaceSpaceScanAborted,
  WorkspaceSpaceScanCancelledError
} from './cancellation'
import {
  basenameWorkspacePath,
  joinWorkspacePath,
  normalizeLocalDuPath,
  readLocalDuDepthOne
} from './local-du'
import {
  classifyWorkspaceSpaceError,
  createBaseWorktreeRow,
  createUnavailableWorktreeRow,
  toWorkspaceSpaceItem
} from './rows'

const LOCAL_FS_CONCURRENCY = 48

async function scanLocalEntry(
  entryPath: string,
  name: string,
  signal?: AbortSignal
): Promise<WorkspaceSpaceEntryScan> {
  return scanWorkspaceSpaceEntryTree<Dirent>({
    rootPath: entryPath,
    rootName: name,
    concurrency: LOCAL_FS_CONCURRENCY,
    signal,
    entryName: (entry) => entry.name,
    joinPath: joinWorkspacePath,
    classifyEntry: async (path) => {
      const stats = await lstat(path)
      throwIfWorkspaceSpaceScanAborted(signal)
      if (stats.isSymbolicLink()) {
        return { kind: 'symlink', sizeBytes: stats.size }
      }
      return stats.isDirectory()
        ? { kind: 'directory', sizeBytes: stats.size }
        : { kind: 'file', sizeBytes: stats.size }
    },
    readDirectory: (path) => opendir(path),
    checkCancelled: () => throwIfWorkspaceSpaceScanAborted(signal),
    createCancellationError: () => new WorkspaceSpaceScanCancelledError(),
    isCancellationError: (error) => error instanceof WorkspaceSpaceScanCancelledError
  })
}

async function scanLocalTopLevelEntry(
  entryPath: string,
  name: string,
  duSizes: Map<string, number>,
  signal?: AbortSignal
): Promise<WorkspaceSpaceEntryScan> {
  throwIfWorkspaceSpaceScanAborted(signal)
  const stats = await lstat(entryPath)
  throwIfWorkspaceSpaceScanAborted(signal)
  if (stats.isSymbolicLink()) {
    return { name, path: entryPath, kind: 'symlink', sizeBytes: stats.size, skippedEntryCount: 0 }
  }
  if (!stats.isDirectory()) {
    return { name, path: entryPath, kind: 'file', sizeBytes: stats.size, skippedEntryCount: 0 }
  }
  return {
    name,
    path: entryPath,
    kind: 'directory',
    sizeBytes: duSizes.get(normalizeLocalDuPath(entryPath)) ?? stats.size,
    skippedEntryCount: 0
  }
}

async function scanLocalWorktreeWithDu(
  repo: Repo,
  worktree: Worktree,
  scannedAt: number,
  signal?: AbortSignal
): Promise<WorkspaceSpaceWorktree> {
  throwIfWorkspaceSpaceScanAborted(signal)
  const rootStats = await lstat(worktree.path)
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    const root = await scanLocalEntry(worktree.path, basenameWorkspacePath(worktree.path), signal)
    return createSuccessfulRow(repo, worktree, scannedAt, root)
  }
  const [entries, duSizes] = await Promise.all([
    opendir(worktree.path).then(async (directory) => {
      const admission = await collectWorkspaceSpaceDirectoryEntries(
        directory,
        worktree.path,
        (entry) => entry.name,
        createWorkspaceSpaceScanBudget(),
        () => throwIfWorkspaceSpaceScanAborted(signal)
      )
      return admission.entries
    }),
    readLocalDuDepthOne(worktree.path, signal)
  ])
  throwIfWorkspaceSpaceScanAborted(signal)
  const childStats = await mapWorkspaceSpaceWithLimit(
    entries,
    LOCAL_FS_CONCURRENCY,
    async (entry): Promise<WorkspaceSpaceEntryScan | null> => {
      try {
        return await scanLocalTopLevelEntry(
          joinWorkspacePath(worktree.path, entry.name),
          entry.name,
          duSizes,
          signal
        )
      } catch (error) {
        if (error instanceof WorkspaceSpaceScanCancelledError) {
          throw error
        }
        return null
      }
    }
  )
  const children = childStats.filter((child): child is WorkspaceSpaceEntryScan => child !== null)
  const rootSize =
    duSizes.get(normalizeLocalDuPath(worktree.path)) ??
    rootStats.size + children.reduce((sum, child) => sum + child.sizeBytes, 0)
  return {
    ...createBaseWorktreeRow(repo, worktree, scannedAt),
    status: 'ok',
    error: null,
    sizeBytes: rootSize,
    reclaimableBytes: worktree.isMainWorktree ? 0 : rootSize,
    skippedEntryCount: childStats.length - children.length,
    ...compactWorkspaceSpaceItems(children.map(toWorkspaceSpaceItem))
  }
}

async function scanLocalWorktreeWithNode(
  repo: Repo,
  worktree: Worktree,
  scannedAt: number,
  signal?: AbortSignal
): Promise<WorkspaceSpaceWorktree> {
  try {
    const root = await scanLocalEntry(worktree.path, basenameWorkspacePath(worktree.path), signal)
    return createSuccessfulRow(repo, worktree, scannedAt, root)
  } catch (error) {
    if (error instanceof WorkspaceSpaceScanCancelledError) {
      throw error
    }
    const classified = classifyWorkspaceSpaceError(error)
    return createUnavailableWorktreeRow(
      repo,
      worktree,
      scannedAt,
      classified.status,
      classified.message
    )
  }
}

export async function scanLocalWorktree(
  repo: Repo,
  worktree: Worktree,
  scannedAt: number,
  signal?: AbortSignal
): Promise<WorkspaceSpaceWorktree> {
  throwIfWorkspaceSpaceScanAborted(signal)
  if (platform !== 'win32') {
    try {
      // Why: POSIX du gives bounded top-level sizing without following symlinks.
      return await scanLocalWorktreeWithDu(repo, worktree, scannedAt, signal)
    } catch (error) {
      throwIfWorkspaceSpaceScanAborted(signal)
      if (error instanceof WorkspaceSpaceScanCancelledError) {
        throw error
      }
      if (error instanceof WorkspaceSpaceScanCapacityError) {
        const classified = classifyWorkspaceSpaceError(error)
        return createUnavailableWorktreeRow(
          repo,
          worktree,
          scannedAt,
          classified.status,
          classified.message
        )
      }
    }
  }
  return scanLocalWorktreeWithNode(repo, worktree, scannedAt, signal)
}

function createSuccessfulRow(
  repo: Repo,
  worktree: Worktree,
  scannedAt: number,
  root: WorkspaceSpaceEntryScan
): WorkspaceSpaceWorktree {
  return {
    ...createBaseWorktreeRow(repo, worktree, scannedAt),
    status: 'ok',
    error: null,
    sizeBytes: root.sizeBytes,
    reclaimableBytes: worktree.isMainWorktree ? 0 : root.sizeBytes,
    skippedEntryCount: root.skippedEntryCount,
    ...compactWorkspaceSpaceItems((root.children ?? []).map(toWorkspaceSpaceItem))
  }
}
