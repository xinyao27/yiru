import { basename, posix, win32 } from 'node:path'

import type { Repo } from '@yiru/runtime-protocol/workbench/types'
import { canonicalizeUsageWorktreePaths } from '~main/stats/worktree-canonicalizer'
import { areWorktreePathsEqual } from '~main/worktree/logic'

import {
  canonicalizePath,
  looksLikeWindowsPath,
  normalizeComparablePath,
  normalizeFsPath
} from './session-discovery'
import type {
  CodexUsageAttributedEvent,
  CodexUsageLocationBreakdown,
  CodexUsageParsedEvent
} from './types'
import type { CodexUsageWorktreeRef } from './usage-record-model'

function getDefaultProjectLabel(cwd: string | null): string {
  if (!cwd) {
    return 'Unknown location'
  }
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length >= 2) {
    return parts.slice(-2).join('/')
  }
  return parts.at(-1) ?? cwd
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

export async function buildWorktreesWithCanonicalPaths(
  worktrees: CodexUsageWorktreeRef[]
): Promise<(CodexUsageWorktreeRef & { canonicalPath: string })[]> {
  return canonicalizeUsageWorktreePaths(worktrees, canonicalizePath)
}

function isContainingPath(candidatePath: string, targetPath: string): boolean {
  const useWin32 = looksLikeWindowsPath(candidatePath) || looksLikeWindowsPath(targetPath)
  const relativePath = useWin32
    ? win32.relative(candidatePath, targetPath)
    : posix.relative(candidatePath, targetPath)
  if (!relativePath) {
    return true
  }
  // Why: on Windows, `path.relative('C:\\repo', 'D:\\other')` returns an
  // absolute `D:\\other` path instead of a `..`-prefixed relative. Treating
  // that as "contained" would attribute off-drive Codex usage to the wrong
  // Yiru worktree.
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

function findContainingWorktree(
  cwd: string,
  worktrees: (CodexUsageWorktreeRef & { canonicalPath: string })[]
): CodexUsageWorktreeRef | null {
  const normalizedCwd = normalizeFsPath(cwd)
  for (const worktree of worktrees) {
    if (areWorktreePathsEqual(worktree.canonicalPath, normalizedCwd)) {
      return worktree
    }
    if (isContainingPath(worktree.canonicalPath, normalizedCwd)) {
      return worktree
    }
  }
  return null
}

export async function attributeCodexUsageEvent(
  event: CodexUsageParsedEvent,
  worktrees: (CodexUsageWorktreeRef & { canonicalPath: string })[],
  worktreeByCwd?: Map<string, CodexUsageWorktreeRef | null>
): Promise<CodexUsageAttributedEvent | null> {
  const day = localDayFromTimestamp(event.timestamp)
  if (!day) {
    return null
  }

  let repoId: string | null = null
  let worktreeId: string | null = null
  let projectKey = 'unscoped'
  let projectLabel = getDefaultProjectLabel(event.cwd)

  if (event.cwd) {
    let worktree = worktreeByCwd?.get(event.cwd)
    if (worktree === undefined) {
      worktree = findContainingWorktree(event.cwd, worktrees)
      worktreeByCwd?.set(event.cwd, worktree)
    }
    if (worktree) {
      repoId = worktree.repoId
      worktreeId = worktree.worktreeId
      projectKey = `worktree:${worktree.worktreeId}`
      projectLabel = worktree.displayName
    } else {
      // Why: all-local mode should still collapse repeated off-Yiru sessions by
      // location, but those keys must normalize slash/case differences so the
      // same folder does not fragment into multiple "projects" across platforms.
      projectKey = `cwd:${normalizeComparablePath(event.cwd)}`
    }
  }

  return {
    ...event,
    day,
    projectKey,
    projectLabel,
    repoId,
    worktreeId
  }
}

export function createWorktreeRefs(
  repos: Repo[],
  worktreesByRepo: Map<string, { path: string; worktreeId: string; displayName: string }[]>
): CodexUsageWorktreeRef[] {
  const refs: CodexUsageWorktreeRef[] = []
  for (const repo of repos) {
    for (const worktree of worktreesByRepo.get(repo.id) ?? []) {
      refs.push({
        repoId: repo.id,
        worktreeId: worktree.worktreeId,
        path: worktree.path,
        displayName: worktree.displayName
      })
    }
  }
  return refs
}

export function getDefaultWorktreeLabel(pathValue: string): string {
  return basename(pathValue)
}

export function getSessionProjectLabel(locationBreakdown: CodexUsageLocationBreakdown[]): string {
  if (locationBreakdown.length === 0) {
    return 'Unknown location'
  }
  if (locationBreakdown.length === 1) {
    return locationBreakdown[0].projectLabel
  }
  return 'Multiple locations'
}
