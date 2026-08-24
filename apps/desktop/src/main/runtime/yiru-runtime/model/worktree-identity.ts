import {
  isWindowsAbsolutePathLike,
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison
} from '@yiru/workbench-model/platform'
import { parsePtySessionId } from '@yiru/workbench-model/workspace'
import { splitWorktreeId } from '@yiru/workbench-model/workspace'
import { worktreePathComparisonKey } from '~main/worktree/path-comparison'
import type { RuntimeWorktreePsSummary } from '~shared/runtime-types'
import type { WorkspaceSessionState } from '~shared/types'

import { normalizeLocalBranchName } from './review-branch'
import type { ResolvedWorktree } from './worktree-resolution'

export function branchSelectorMatches(branch: string, selector: string): boolean {
  // Why: Git worktree data can report local branches as either `refs/heads/foo`
  // or `foo` depending on which plumbing path produced the record. Yiru's
  // branch selectors should accept either form so newly created worktrees stay
  // discoverable without exposing internal ref-shape differences to users.
  return normalizeLocalBranchName(branch) === normalizeLocalBranchName(selector)
}

export function runtimePathsEqual(left: string, right: string): boolean {
  return normalizeRuntimePathForComparison(left) === normalizeRuntimePathForComparison(right)
}

export function inferWorktreeIdFromPtyId(ptyId: string): string | null {
  return parsePtySessionId(ptyId).worktreeId
}

export function indexPersistedPtyWorktreeBindings(
  session: WorkspaceSessionState | null | undefined
): ReadonlyMap<string, string> {
  const worktreeIdByPtyId = new Map<string, string>()
  const ambiguousPtyIds = new Set<string>()
  const bind = (ptyId: string | null | undefined, worktreeId: string): void => {
    if (!ptyId || ambiguousPtyIds.has(ptyId)) {
      return
    }
    const existingWorktreeId = worktreeIdByPtyId.get(ptyId)
    if (existingWorktreeId && existingWorktreeId !== worktreeId) {
      // Why: corrupt/stale duplicate bindings must not attribute a live PTY to
      // whichever workspace happened to be visited first.
      worktreeIdByPtyId.delete(ptyId)
      ambiguousPtyIds.add(ptyId)
      return
    }
    worktreeIdByPtyId.set(ptyId, worktreeId)
  }

  for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
    for (const tab of tabs) {
      bind(tab.ptyId, worktreeId)
      bind(session?.remoteSessionIdsByTabId?.[tab.id], worktreeId)
      const layout = session?.terminalLayoutsByTabId[tab.id]
      for (const ptyId of Object.values(layout?.ptyIdsByLeafId ?? {})) {
        bind(ptyId, worktreeId)
      }
    }
  }
  return worktreeIdByPtyId
}

export function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false
    }
  }
  return true
}

export function parseRuntimeWorktreeId(
  worktreeId: string
): { repoId: string; worktreePath: string } | null {
  const parsed = splitWorktreeId(worktreeId)
  if (!parsed?.repoId) {
    return null
  }
  if (!parsed.worktreePath) {
    return null
  }
  return parsed
}

export type RuntimeWorktreeSummaryPathCandidate = {
  summary: RuntimeWorktreePsSummary
  order: number
}

export type RuntimeWorktreeSummaryPathIndex = {
  platformByRepoId: ReadonlyMap<string, NodeJS.Platform>
  posixAbsolute: Map<string, RuntimeWorktreeSummaryPathCandidate>
  posixRelative: Map<string, RuntimeWorktreeSummaryPathCandidate>
  windows: Map<string, RuntimeWorktreeSummaryPathCandidate>
  windowsAbsolute: Map<string, RuntimeWorktreeSummaryPathCandidate>
}

export function buildRuntimeWorktreeSummaryPathIndex(
  summaries: ReadonlyMap<string, RuntimeWorktreePsSummary>,
  resolvedWorktrees: readonly ResolvedWorktree[],
  platformByRepoId: ReadonlyMap<string, NodeJS.Platform>
): RuntimeWorktreeSummaryPathIndex {
  const index: RuntimeWorktreeSummaryPathIndex = {
    platformByRepoId,
    posixAbsolute: new Map(),
    posixRelative: new Map(),
    windows: new Map(),
    windowsAbsolute: new Map()
  }
  for (const [order, worktree] of resolvedWorktrees.entries()) {
    const summary = summaries.get(worktree.id)
    if (!summary) {
      continue
    }
    const platform = platformByRepoId.get(worktree.repoId) ?? process.platform
    const candidate = { summary, order }
    if (isPosixAbsoluteRuntimeWorktreePath(worktree.path)) {
      setFirstRuntimeWorktreePathCandidate(
        index.posixAbsolute,
        runtimeWorktreeSummaryPathKey(worktree.repoId, worktree.path, platform),
        candidate
      )
      continue
    }

    const windowsKey = runtimeWorktreeSummaryPathKey(worktree.repoId, worktree.path, 'win32')
    setFirstRuntimeWorktreePathCandidate(index.windows, windowsKey, candidate)
    if (isWindowsAbsolutePathLike(worktree.path)) {
      setFirstRuntimeWorktreePathCandidate(index.windowsAbsolute, windowsKey, candidate)
    } else if (platform !== 'win32') {
      setFirstRuntimeWorktreePathCandidate(
        index.posixRelative,
        runtimeWorktreeSummaryPathKey(worktree.repoId, worktree.path, platform),
        candidate
      )
    }
  }
  return index
}

export function findRuntimeWorktreeSummaryByPath(
  index: RuntimeWorktreeSummaryPathIndex,
  repoId: string,
  worktreePath: string,
  platform: NodeJS.Platform
): RuntimeWorktreePsSummary | null {
  if (isPosixAbsoluteRuntimeWorktreePath(worktreePath)) {
    return (
      index.posixAbsolute.get(runtimeWorktreeSummaryPathKey(repoId, worktreePath, platform))
        ?.summary ?? null
    )
  }

  const windowsKey = runtimeWorktreeSummaryPathKey(repoId, worktreePath, 'win32')
  if (platform === 'win32' || isWindowsAbsolutePathLike(worktreePath)) {
    return index.windows.get(windowsKey)?.summary ?? null
  }

  const posixCandidate = index.posixRelative.get(
    runtimeWorktreeSummaryPathKey(repoId, worktreePath, platform)
  )
  const windowsCandidate = index.windowsAbsolute.get(windowsKey)
  // Why: a malformed relative path can compare as POSIX against another
  // relative path or as Windows against an absolute Windows path. Preserve the
  // old pairwise scan's first-match result without rescanning every worktree.
  if (!posixCandidate) {
    return windowsCandidate?.summary ?? null
  }
  if (!windowsCandidate || posixCandidate.order < windowsCandidate.order) {
    return posixCandidate.summary
  }
  return windowsCandidate.summary
}

export function setFirstRuntimeWorktreePathCandidate(
  candidates: Map<string, RuntimeWorktreeSummaryPathCandidate>,
  key: string,
  candidate: RuntimeWorktreeSummaryPathCandidate
): void {
  if (!candidates.has(key)) {
    candidates.set(key, candidate)
  }
}

export function isPosixAbsoluteRuntimeWorktreePath(worktreePath: string): boolean {
  return worktreePath.startsWith('/') && !worktreePath.startsWith('//')
}

export function runtimeWorktreeSummaryPathKey(
  repoId: string,
  worktreePath: string,
  platform: NodeJS.Platform
): string {
  return `${repoId}\0${worktreePathComparisonKey(worktreePath, platform)}`
}

export function includeTargetResolvedWorktree(
  resolvedWorktrees: ResolvedWorktree[],
  targetWorktree: ResolvedWorktree | null
): ResolvedWorktree[] {
  if (!targetWorktree || resolvedWorktrees.some((worktree) => worktree.id === targetWorktree.id)) {
    return resolvedWorktrees
  }
  return [...resolvedWorktrees, targetWorktree]
}

export function findResolvedWorktreeIdForPath(
  resolvedWorktrees: ResolvedWorktree[],
  cwd: string
): string | null {
  if (!cwd) {
    return null
  }
  const matches = resolvedWorktrees
    .filter((worktree) => isPathInsideOrEqual(worktree.path, cwd))
    .sort((left, right) => right.path.length - left.path.length)
  return matches[0]?.id ?? null
}
