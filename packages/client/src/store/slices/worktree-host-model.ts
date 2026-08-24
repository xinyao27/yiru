import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import type {
  DetectedWorktreeListResult,
  Worktree,
  WorkspaceVisibleTabType,
  WorktreeLineage,
  ProjectHostSetup
} from '~shared/types'

import type { AppState } from '../types'
import { findRepoForHost } from './repo-host-identity'
import { sanitizeHostedReviewLinksForBranchClears } from './worktree-review-state'
import { getRepoIdFromWorktreeId } from './worktree-state'

export function toVisibleTabType(contentType: string): WorkspaceVisibleTabType {
  if (contentType === 'browser' || contentType === 'terminal' || contentType === 'simulator') {
    return contentType
  }
  return 'editor'
}

export type WorktreeWithLineage = Worktree & {
  parentWorktreeId?: string | null
  childWorktreeIds?: string[]
  lineage?: WorktreeLineage | null
}

export function toVisibleWorktree(
  worktree: DetectedWorktreeListResult['worktrees'][number]
): Worktree {
  const {
    ownership: _ownership,
    selectedCheckout: _selectedCheckout,
    visible: _visible,
    ...base
  } = worktree
  return base
}

// Why: runtime worktree payloads arrive from the owning host's own perspective,
// so their hostId defaults to "local" even for remote checkouts. Re-stamp them
// with the repo's execution host so per-worktree host resolution doesn't route
// remote terminals to the local machine. Local-owned repos are left untouched,
// so an explicit local worktree still overrides a runtime repo owner.
export function withRepoHostOwnership<
  T extends { hostId?: ExecutionHostId; projectId?: string; projectHostSetupId?: string }
>(worktree: T, hostId: ExecutionHostId, setup?: ProjectHostSetup): T {
  const nextHostId = hostId === LOCAL_EXECUTION_HOST_ID ? worktree.hostId : hostId
  const projectId = worktree.projectId ?? setup?.projectId
  const projectHostSetupId = worktree.projectHostSetupId ?? setup?.id
  if (
    nextHostId === worktree.hostId &&
    projectId === worktree.projectId &&
    projectHostSetupId === worktree.projectHostSetupId
  ) {
    return worktree
  }
  return {
    ...worktree,
    ...(nextHostId ? { hostId: nextHostId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(projectHostSetupId ? { projectHostSetupId } : {})
  }
}

export function repoHostId(
  state: Pick<AppState, 'repos' | 'settings'>,
  repoId: string,
  hostId?: ExecutionHostId | null
): ExecutionHostId {
  const repo = findRepoForHost(state.repos, repoId, { hostId, settings: state.settings })
  return repo ? getRepoExecutionHostId(repo) : LOCAL_EXECUTION_HOST_ID
}

export function repoHasExecutionHost(
  state: Pick<AppState, 'repos'>,
  repoId: string,
  hostId: ExecutionHostId,
  ownerWasMissingAtStart: boolean
): boolean {
  const repoOwners = state.repos.filter((repo) => repo.id === repoId)
  // Why: worktrees can load before the repo catalog during startup; only reject
  // a missing owner when this request previously observed an owned repo.
  return (
    (repoOwners.length === 0 && ownerWasMissingAtStart) ||
    repoOwners.some((repo) => getRepoExecutionHostId(repo) === hostId)
  )
}

export function toVisibleWorktrees(
  result: DetectedWorktreeListResult,
  hostId: ExecutionHostId,
  setup?: ProjectHostSetup
): Worktree[] {
  return result.worktrees
    .filter((worktree) => worktree.visible)
    .map(toVisibleWorktree)
    .map((worktree) => withRepoHostOwnership(worktree, hostId, setup))
}

export function getProjectHostSetupForRepoHost(
  state: Partial<Pick<AppState, 'projectHostSetups'>>,
  repoId: string,
  hostId: ExecutionHostId
): ProjectHostSetup | undefined {
  return state.projectHostSetups?.find(
    (setup) => setup.repoId === repoId && setup.hostId === hostId
  )
}

export function getHydratedSessionWorktreeIdsForRepo(state: AppState, repoId: string): string[] {
  return Object.keys(state.tabsByWorktree).filter((id) => getRepoIdFromWorktreeId(id) === repoId)
}

export type WorktreeHostMatchOptions = {
  unhostedWorktreesMatchHost?: boolean
}

export type RepoHostSummary = {
  count: number
  onlyHostId?: ExecutionHostId
}

export const repoHostSummariesByRepos = new WeakMap<
  AppState['repos'],
  Map<string, RepoHostSummary>
>()

export function getRepoHostSummaries(repos: AppState['repos']): Map<string, RepoHostSummary> {
  const cached = repoHostSummariesByRepos.get(repos)
  if (cached) {
    return cached
  }

  const summaries = new Map<string, RepoHostSummary>()
  for (const repo of repos) {
    const current = summaries.get(repo.id)
    if (current) {
      summaries.set(repo.id, { count: current.count + 1 })
    } else {
      summaries.set(repo.id, { count: 1, onlyHostId: getRepoExecutionHostId(repo) })
    }
  }
  repoHostSummariesByRepos.set(repos, summaries)
  return summaries
}

export function unhostedWorktreesMatchRefreshHost(
  state: Pick<AppState, 'repos'>,
  repoId: string,
  hostId: ExecutionHostId
): boolean {
  if (hostId === LOCAL_EXECUTION_HOST_ID) {
    return true
  }

  const summary = getRepoHostSummaries(state.repos).get(repoId)
  return summary?.count === 1 && summary.onlyHostId === hostId
}

export function worktreeHostMatchOptions(
  state: Pick<AppState, 'repos'>,
  repoId: string,
  hostId: ExecutionHostId
): WorktreeHostMatchOptions {
  return {
    // Why: pre-host persisted runtime/SSH worktrees were stored without hostId.
    // Treat them as the sole repo owner's rows, but keep ambiguous duplicates local.
    unhostedWorktreesMatchHost: unhostedWorktreesMatchRefreshHost(state, repoId, hostId)
  }
}

export function worktreeMatchesHost(
  worktree: { hostId?: ExecutionHostId },
  hostId: ExecutionHostId,
  options: WorktreeHostMatchOptions = {}
): boolean {
  if (worktree.hostId) {
    return worktree.hostId === hostId
  }
  return options.unhostedWorktreesMatchHost ?? hostId === LOCAL_EXECUTION_HOST_ID
}

export function mergeWorktreesForHost<T extends { hostId?: ExecutionHostId }>(
  current: readonly T[] | undefined,
  refreshed: readonly T[],
  hostId: ExecutionHostId,
  options?: WorktreeHostMatchOptions
): T[] {
  // Why: host-scoped refreshes should replace that host in place so alternating
  // local/runtime refreshes do not churn sibling row order or sortEpoch.
  const existing = current ?? []
  const next: T[] = []
  let inserted = false

  for (const worktree of existing) {
    if (worktreeMatchesHost(worktree, hostId, options)) {
      if (!inserted) {
        next.push(...refreshed)
        inserted = true
      }
      continue
    }
    next.push(worktree)
  }

  return inserted ? next : [...next, ...refreshed]
}

export function mergeDetectedWorktreesForHost(
  current: DetectedWorktreeListResult | undefined,
  refreshed: DetectedWorktreeListResult,
  hostId: ExecutionHostId,
  setup?: ProjectHostSetup,
  options?: WorktreeHostMatchOptions
): DetectedWorktreeListResult {
  const refreshedForHost = sanitizeHostedReviewLinksForBranchClears(
    refreshed.worktrees,
    current?.worktrees
  ).map((worktree) => withRepoHostOwnership(worktree, hostId, setup))
  return {
    ...refreshed,
    worktrees: mergeWorktreesForHost(current?.worktrees, refreshedForHost, hostId, options)
  }
}

export function getKnownWorktreeIdsForPurge(
  state: AppState,
  repoId: string,
  hostId: ExecutionHostId
): string[] {
  const detected = state.detectedWorktreesByRepo[repoId]
  const knownIds = new Set<string>()
  const matchOptions = worktreeHostMatchOptions(state, repoId, hostId)
  if (detected?.authoritative === true) {
    for (const worktree of detected.worktrees) {
      if (worktreeMatchesHost(worktree, hostId, matchOptions)) {
        knownIds.add(worktree.id)
      }
    }
  } else {
    for (const worktree of state.worktreesByRepo[repoId] ?? []) {
      if (worktreeMatchesHost(worktree, hostId, matchOptions)) {
        knownIds.add(worktree.id)
      }
    }
  }
  if (!state.hasHydratedWorktreePurge && matchOptions.unhostedWorktreesMatchHost === true) {
    // Why (#1158): hydration can preserve tab keys before worktree metadata exists;
    // the first authoritative scan still needs to reap deleted session-only keys.
    for (const id of getHydratedSessionWorktreeIdsForRepo(state, repoId)) {
      knownIds.add(id)
    }
  }
  return [...knownIds]
}

export function getRemovedWorktreeIdsAfterAuthoritativeScan(
  state: AppState,
  repoId: string,
  detected: DetectedWorktreeListResult,
  hostId: ExecutionHostId
): string[] {
  if (!detected.authoritative) {
    return []
  }
  const detectedIds = new Set(detected.worktrees.map((worktree) => worktree.id))
  return getKnownWorktreeIdsForPurge(state, repoId, hostId).filter((id) => !detectedIds.has(id))
}

export function toLegacyDetectedWorktreeResult(
  repoId: string,
  result: { worktrees: Worktree[] }
): DetectedWorktreeListResult {
  return {
    repoId,
    authoritative: true,
    source: 'session-fallback',
    worktrees: result.worktrees.map((worktree) => ({
      ...worktree,
      ownership: 'yiru-managed',
      selectedCheckout: false,
      visible: true
    }))
  }
}
