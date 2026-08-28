import { realpath } from 'node:fs/promises'
import { posix, win32 } from 'node:path'

import { canonicalizeUsageWorktreePaths } from '~main/stats/worktree-canonicalizer'
import { areWorktreePathsEqual } from '~main/worktree/logic'

import type { OpenCodeUsageAttributedEvent, OpenCodeUsageParsedEvent } from './types'

export type OpenCodeUsageWorktreeRef = {
  repoId: string
  worktreeId: string
  path: string
  displayName: string
}

export type CanonicalOpenCodeUsageWorktree = OpenCodeUsageWorktreeRef & { canonicalPath: string }

function looksLikeWindowsPath(pathValue: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
}

function normalizeComparablePath(pathValue: string, platform = process.platform): string {
  const normalized = pathValue.replace(/\\/g, '/')
  return platform === 'win32' || looksLikeWindowsPath(pathValue)
    ? normalized.toLowerCase()
    : normalized
}

function normalizeFsPath(pathValue: string, platform = process.platform): string {
  if (platform === 'win32' || looksLikeWindowsPath(pathValue)) {
    return win32.normalize(win32.resolve(pathValue))
  }
  return posix.normalize(posix.resolve(pathValue))
}

function getDefaultProjectLabel(cwd: string | null): string {
  if (!cwd) {
    return 'Unknown location'
  }
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length >= 2 ? parts.slice(-2).join('/') : (parts.at(-1) ?? cwd)
}

function localDayFromTimestamp(timestamp: string): string | null {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isContainingPath(candidatePath: string, targetPath: string): boolean {
  const useWin32 = looksLikeWindowsPath(candidatePath) || looksLikeWindowsPath(targetPath)
  const relativePath = useWin32
    ? win32.relative(candidatePath, targetPath)
    : posix.relative(candidatePath, targetPath)
  if (!relativePath) {
    return true
  }
  const isAbsoluteRelative = useWin32
    ? win32.isAbsolute(relativePath)
    : posix.isAbsolute(relativePath)
  const parentPrefix = useWin32 ? `..${win32.sep}` : `..${posix.sep}`
  // Why: `..name` is a valid child path; only `..` and `../...` escape.
  return (
    !isAbsoluteRelative &&
    relativePath !== '..' &&
    !relativePath.startsWith(parentPrefix) &&
    relativePath !== '.'
  )
}

async function canonicalizePath(pathValue: string): Promise<string> {
  try {
    return normalizeFsPath(await realpath(pathValue))
  } catch {
    return normalizeFsPath(pathValue)
  }
}

export async function buildWorktreesWithCanonicalPaths(
  worktrees: OpenCodeUsageWorktreeRef[]
): Promise<CanonicalOpenCodeUsageWorktree[]> {
  return canonicalizeUsageWorktreePaths(worktrees, canonicalizePath)
}

function findContainingWorktree(
  cwd: string,
  worktrees: CanonicalOpenCodeUsageWorktree[]
): OpenCodeUsageWorktreeRef | null {
  const normalizedCwd = normalizeFsPath(cwd)
  return (
    worktrees.find(
      (worktree) =>
        areWorktreePathsEqual(worktree.canonicalPath, normalizedCwd) ||
        isContainingPath(worktree.canonicalPath, normalizedCwd)
    ) ?? null
  )
}

export async function attributeOpenCodeUsageEvent(
  event: OpenCodeUsageParsedEvent,
  worktrees: CanonicalOpenCodeUsageWorktree[]
): Promise<OpenCodeUsageAttributedEvent | null> {
  const day = localDayFromTimestamp(event.timestamp)
  if (!day) {
    return null
  }
  const worktree = event.cwd ? findContainingWorktree(event.cwd, worktrees) : null
  return {
    ...event,
    day,
    projectKey: worktree
      ? `worktree:${worktree.worktreeId}`
      : event.cwd
        ? `cwd:${normalizeComparablePath(event.cwd)}`
        : 'unscoped',
    projectLabel: worktree?.displayName ?? getDefaultProjectLabel(event.cwd),
    repoId: worktree?.repoId ?? null,
    worktreeId: worktree?.worktreeId ?? null
  }
}
