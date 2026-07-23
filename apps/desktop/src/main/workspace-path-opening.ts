import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

import { isPathInsideOrEqual } from '@yiru/workbench-model/platform'

export type WorkspacePathOpenErrorCode =
  | 'path_not_absolute'
  | 'path_not_found'
  | 'path_not_directory'
  | 'path_unavailable'
  | 'context_path_mismatch'

export class WorkspacePathOpenError extends Error {
  constructor(
    readonly code: WorkspacePathOpenErrorCode,
    readonly targetPath: string,
    message: string
  ) {
    super(message)
    this.name = 'WorkspacePathOpenError'
  }
}

export async function resolveWorkspaceOpenDirectoryPath(targetPath: string): Promise<string> {
  if (!isAbsolute(targetPath)) {
    throw new WorkspacePathOpenError(
      'path_not_absolute',
      targetPath,
      `Workspace path must be absolute: ${targetPath}`
    )
  }

  let targetStat
  try {
    targetStat = await stat(targetPath)
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    if (code === 'ENOENT') {
      throw new WorkspacePathOpenError(
        'path_not_found',
        targetPath,
        `Directory does not exist: ${targetPath}`
      )
    }
    throw new WorkspacePathOpenError(
      'path_unavailable',
      targetPath,
      `Directory is not accessible: ${targetPath}`
    )
  }
  if (!targetStat.isDirectory()) {
    throw new WorkspacePathOpenError(
      'path_not_directory',
      targetPath,
      `Path is not a directory: ${targetPath}`
    )
  }

  try {
    return await realpath(targetPath)
  } catch {
    throw new WorkspacePathOpenError(
      'path_unavailable',
      targetPath,
      `Directory is not accessible: ${targetPath}`
    )
  }
}

export async function findWorkspaceOpenWorktree<T extends { path: string }>(
  worktrees: T[],
  targetPath: string
): Promise<T | null> {
  const directMatches = worktrees
    .filter((worktree) => isPathInsideOrEqual(worktree.path, targetPath))
    .sort((left, right) => right.path.length - left.path.length)
  if (directMatches[0]) {
    return directMatches[0]
  }

  // Why: CLI callers commonly enter through symlinked project paths while
  // Git and Yiru persist canonical roots; compare both identities before adding.
  const canonicalCandidates = await Promise.all(
    worktrees.map(async (worktree) => {
      try {
        return { worktree, path: await realpath(worktree.path) }
      } catch {
        return null
      }
    })
  )
  return (
    canonicalCandidates
      .filter(
        (candidate): candidate is { worktree: T; path: string } =>
          candidate !== null && isPathInsideOrEqual(candidate.path, targetPath)
      )
      .sort((left, right) => right.path.length - left.path.length)[0]?.worktree ?? null
  )
}
