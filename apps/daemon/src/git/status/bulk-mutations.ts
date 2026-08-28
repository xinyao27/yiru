import * as path from 'node:path'

import { removeSafeUntrackedDiscardTargets } from '~main/git/status/discard-path-safety'

import { gitExecFileAsync } from '../runner/runner'
import type { GitRuntimeOptions } from '../runner/runtime-options'
import { gitOptionsForWorktree } from '../runner/runtime-options'
import { invalidateGitReadCaches } from './cache'

const BULK_CHUNK_SIZE = 100

function normalizeGitPathForCompare(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function literalPathspec(filePath: string, options: GitRuntimeOptions): string {
  // Why: Windows validation produces backslashes, but Git running inside WSL
  // needs POSIX paths. Host paths stay untouched so POSIX filenames remain literal.
  const runtimePath = options.wslDistro ? filePath.replace(/\\/g, '/') : filePath
  return `:(literal)${runtimePath}`
}

function isTrackedPathSpec(filePath: string, trackedPaths: readonly string[]): boolean {
  const normalized = normalizeGitPathForCompare(filePath)
  return trackedPaths.some((trackedPath) => {
    const normalizedTracked = normalizeGitPathForCompare(trackedPath)
    return normalizedTracked === normalized || normalizedTracked.startsWith(`${normalized}/`)
  })
}

async function listTrackedPathSpecs(
  worktreePath: string,
  filePaths: readonly string[],
  options: GitRuntimeOptions = {}
): Promise<string[]> {
  const trackedPaths: string[] = []
  for (let i = 0; i < filePaths.length; i += BULK_CHUNK_SIZE) {
    const chunk = filePaths.slice(i, i + BULK_CHUNK_SIZE)
    const { stdout } = await gitExecFileAsync(
      ['ls-files', '-z', '--', ...chunk.map((filePath) => literalPathspec(filePath, options))],
      {
        ...gitOptionsForWorktree(worktreePath, options)
      }
    )
    // Why: a tracked directory can contain enough paths for push(...split)
    // to exceed the JavaScript argument limit before discard decisions run.
    for (const trackedPath of stdout.split('\0')) {
      if (trackedPath) {
        trackedPaths.push(trackedPath)
      }
    }
  }
  return trackedPaths
}

export async function cleanUntrackedPaths(
  worktreePath: string,
  filePaths: readonly string[],
  options: GitRuntimeOptions = {}
): Promise<void> {
  for (let i = 0; i < filePaths.length; i += BULK_CHUNK_SIZE) {
    const chunk = filePaths.slice(i, i + BULK_CHUNK_SIZE)
    if (chunk.length > 0) {
      // Why: Git pathspec cleanup avoids raw recursive deletion through symlinked parents.
      await gitExecFileAsync(
        ['clean', '-ffdx', '--', ...chunk.map((filePath) => literalPathspec(filePath, options))],
        {
          ...gitOptionsForWorktree(worktreePath, options)
        }
      )
    }
  }
}

/**
 * Discard working tree changes for many paths in a small number of subprocesses.
 */
export async function bulkDiscardChanges(
  worktreePath: string,
  filePaths: string[],
  options: GitRuntimeOptions = {}
): Promise<void> {
  invalidateGitReadCaches()
  if (filePaths.length === 0) {
    return
  }

  try {
    const resolvedWorktree = path.resolve(worktreePath)
    for (const filePath of filePaths) {
      const resolvedTarget = path.resolve(worktreePath, filePath)
      if (!isWithinWorktree(path, resolvedWorktree, resolvedTarget)) {
        throw new Error(`Path "${filePath}" resolves outside the worktree`)
      }
    }

    const trackedPathSpecs = await listTrackedPathSpecs(worktreePath, filePaths, options)
    const trackedPaths = filePaths.filter((filePath) =>
      isTrackedPathSpec(filePath, trackedPathSpecs)
    )
    const untrackedPaths = filePaths.filter(
      (filePath) => !isTrackedPathSpec(filePath, trackedPathSpecs)
    )
    await removeSafeUntrackedDiscardTargets(
      worktreePath,
      untrackedPaths,
      (targetPaths) => cleanUntrackedPaths(worktreePath, targetPaths, options),
      async () => {
        for (let i = 0; i < trackedPaths.length; i += BULK_CHUNK_SIZE) {
          const chunk = trackedPaths.slice(i, i + BULK_CHUNK_SIZE)
          await gitExecFileAsync(
            [
              'restore',
              '--worktree',
              '--source=HEAD',
              '--',
              ...chunk.map((filePath) => literalPathspec(filePath, options))
            ],
            {
              ...gitOptionsForWorktree(worktreePath, options)
            }
          )
        }
      }
    )
  } finally {
    invalidateGitReadCaches()
  }
}

export function isWithinWorktree(
  pathApi: Pick<typeof path, 'isAbsolute' | 'relative' | 'sep'>,
  resolvedWorktree: string,
  resolvedTarget: string
): boolean {
  const relativeTarget = pathApi.relative(resolvedWorktree, resolvedTarget)
  return !(
    relativeTarget === '' ||
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${pathApi.sep}`) ||
    pathApi.isAbsolute(relativeTarget)
  )
}

/**
 * Bulk stage files in batches to avoid E2BIG.
 */
export async function bulkStageFiles(
  worktreePath: string,
  filePaths: string[],
  options: GitRuntimeOptions = {}
): Promise<void> {
  invalidateGitReadCaches()
  if (filePaths.length === 0) {
    return
  }
  try {
    for (let i = 0; i < filePaths.length; i += BULK_CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + BULK_CHUNK_SIZE)
      await gitExecFileAsync(
        ['add', '--', ...chunk.map((filePath) => literalPathspec(filePath, options))],
        gitOptionsForWorktree(worktreePath, options)
      )
    }
  } finally {
    invalidateGitReadCaches()
  }
}

/**
 * Bulk unstage files in batches to avoid E2BIG.
 */
export async function bulkUnstageFiles(
  worktreePath: string,
  filePaths: string[],
  options: GitRuntimeOptions = {}
): Promise<void> {
  invalidateGitReadCaches()
  if (filePaths.length === 0) {
    return
  }
  try {
    for (let i = 0; i < filePaths.length; i += BULK_CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + BULK_CHUNK_SIZE)
      await gitExecFileAsync(
        [
          'restore',
          '--staged',
          '--',
          ...chunk.map((filePath) => literalPathspec(filePath, options))
        ],
        {
          ...gitOptionsForWorktree(worktreePath, options)
        }
      )
    }
  } finally {
    invalidateGitReadCaches()
  }
}
