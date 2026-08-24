import { useShallow } from 'zustand/react/shallow'
import type { Repo, Worktree } from '~shared/types'

import { useAppStore } from './index'
import { getProjectHostSetupProjectionFromState } from './project-host-setup-selector'
import type { AppState } from './types'
import {
  getIndexedAllWorktrees as getCachedAllWorktrees,
  getIndexedRepoMap as getCachedRepoMap,
  getIndexedWorktreeMap as getCachedWorktreeMap
} from './worktree-repo-index'

export { getProjectHostSetupProjectionFromState } from './project-host-setup-selector'

const EMPTY_WORKTREES: Worktree[] = []
const hasAnyWorktreesCache = new WeakMap<AppState['worktreesByRepo'], boolean>()

function getCachedHasAnyWorktrees(worktreesByRepo: AppState['worktreesByRepo']): boolean {
  const cached = hasAnyWorktreesCache.get(worktreesByRepo)
  if (cached !== undefined) {
    return cached
  }

  // Why: this selector sits in an always-mounted scanner. Cache by slice
  // identity so unrelated store writes do not rescan every repo bucket.
  const hasWorktrees = Object.values(worktreesByRepo).some((worktrees) => worktrees.length > 0)
  hasAnyWorktreesCache.set(worktreesByRepo, hasWorktrees)
  return hasWorktrees
}

export function getAllWorktreesFromState(state: Pick<AppState, 'worktreesByRepo'>): Worktree[] {
  return getCachedAllWorktrees(state.worktreesByRepo)
}

export function getWorktreeMapFromState(
  state: Pick<AppState, 'worktreesByRepo'>
): Map<string, Worktree> {
  return getCachedWorktreeMap(state.worktreesByRepo)
}

export function getHasAnyWorktreesFromState(state: Pick<AppState, 'worktreesByRepo'>): boolean {
  return getCachedHasAnyWorktrees(state.worktreesByRepo)
}

export function getRepoMapFromState(state: Pick<AppState, 'repos'>): Map<string, Repo> {
  return getCachedRepoMap(state.repos)
}

// ─── Repos ──────────────────────────────────────────────────────────
export const useRepos = () => useAppStore((s) => s.repos)
export const useActiveRepo = () =>
  useAppStore(useShallow((s) => s.repos.find((r) => r.id === s.activeRepoId) ?? null))
export const useRepoMap = () => useAppStore((s) => getCachedRepoMap(s.repos))
export const useRepoById = (repoId: string | null) =>
  useAppStore((s) => (repoId ? (getCachedRepoMap(s.repos).get(repoId) ?? null) : null))
export const useProjectHostSetupProjection = () =>
  useAppStore((s) => getProjectHostSetupProjectionFromState(s))

// ─── Worktrees ──────────────────────────────────────────────────────
export const useActiveWorktreeId = () => useAppStore((s) => s.activeWorktreeId)
export const useWorktreesForRepo = (repoId: string | null) =>
  useAppStore((s) => (repoId ? (s.worktreesByRepo[repoId] ?? EMPTY_WORKTREES) : EMPTY_WORKTREES))
export const useAllWorktrees = () => useAppStore((s) => getCachedAllWorktrees(s.worktreesByRepo))
export const useWorktreeMap = () => useAppStore((s) => getCachedWorktreeMap(s.worktreesByRepo))
export const useWorktreeById = (worktreeId: string | null) =>
  useAppStore((s) =>
    worktreeId ? (getCachedWorktreeMap(s.worktreesByRepo).get(worktreeId) ?? null) : null
  )
export const useActiveWorktree = () => {
  const activeWorktreeId = useActiveWorktreeId()
  return useAppStore((s) =>
    activeWorktreeId ? (s.getKnownWorktreeById(activeWorktreeId) ?? null) : null
  )
}
