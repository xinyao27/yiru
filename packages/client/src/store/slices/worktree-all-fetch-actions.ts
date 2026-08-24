import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import type { DetectedWorktreeListResult } from '~shared/types'
import { folderWorkspaceKey, parseWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'
import {
  repoHasExecutionHost,
  toVisibleWorktrees,
  getProjectHostSetupForRepoHost,
  worktreeHostMatchOptions,
  worktreeMatchesHost,
  mergeWorktreesForHost,
  mergeDetectedWorktreesForHost,
  getRemovedWorktreeIdsAfterAuthoritativeScan
} from './worktree-host-model'
import { notifyRuntimeScopeForbiddenIfNeeded } from './worktree-known-model'
import { routeListingBranchSwitchesThroughGitIdentity } from './worktree-listing-branch-switch'
import { buildWorktreePurgeState } from './worktree-purge-state'
import {
  mapReposForWorktreeRefresh,
  areWorktreesEqual,
  areDetectedWorktreeResultsEqual
} from './worktree-refresh-model'
import {
  hasBranchScopedHostedReviewContext,
  sanitizeHostedReviewLinksForBranchClears
} from './worktree-review-state'
import {
  settingsForKnownRepoOwner,
  listDetectedWorktreesForRepoCoalesced
} from './worktree-runtime-list-model'
import type { WorktreeSlice } from './worktree-state'

export function createWorktreeAllFetchActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'fetchAllWorktrees'> {
  return {
    fetchAllWorktrees: async (options) => {
      const { repos } = get()

      // Why: once the one-shot hydration-time purge has fired, subsequent
      // calls just need to refresh each repo's cached list. No need to
      // double-probe the IPC for the per-repo success signal.
      if (get().hasHydratedWorktreePurge) {
        await mapReposForWorktreeRefresh(repos, async (r) => {
          try {
            const requestStartedState = get()
            const requestStartedWorktrees = requestStartedState.worktreesByRepo[r.id]
            const hostId = getRepoExecutionHostId(r)
            const setup = getProjectHostSetupForRepoHost(requestStartedState, r.id, hostId)
            const settings = settingsForKnownRepoOwner(requestStartedState.settings, r)
            const detected = await listDetectedWorktreesForRepoCoalesced(settings, r.id, {
              executionHostId: hostId,
              reuseRecentCompatibilityFailure: true
            })
            let incoming = toVisibleWorktrees(detected, hostId, setup)
            const latestState = get()
            if (repoHasExecutionHost(latestState, r.id, hostId, false)) {
              const matchOptions = worktreeHostMatchOptions(latestState, r.id, hostId)
              incoming = routeListingBranchSwitchesThroughGitIdentity({
                requestStarted: requestStartedWorktrees,
                current: latestState.worktreesByRepo[r.id],
                incoming,
                matchesRefreshHost: (worktree) =>
                  worktreeMatchesHost(worktree, hostId, matchOptions),
                hasBranchScopedReviewContext: hasBranchScopedHostedReviewContext,
                updateWorktreeGitIdentity: latestState.updateWorktreeGitIdentity
              })
            }
            const worktrees = sanitizeHostedReviewLinksForBranchClears(
              incoming,
              get().worktreesByRepo[r.id]
            )
            set((s) => {
              if (!repoHasExecutionHost(s, r.id, hostId, false)) {
                return s
              }
              const matchOptions = worktreeHostMatchOptions(s, r.id, hostId)
              const removedIds = getRemovedWorktreeIdsAfterAuthoritativeScan(
                s,
                r.id,
                detected,
                hostId
              )
              const mergedWorktrees = mergeWorktreesForHost(
                s.worktreesByRepo[r.id],
                worktrees,
                hostId,
                matchOptions
              )
              const mergedDetected = mergeDetectedWorktreesForHost(
                s.detectedWorktreesByRepo[r.id],
                detected,
                hostId,
                setup,
                matchOptions
              )
              if (
                areWorktreesEqual(s.worktreesByRepo[r.id], mergedWorktrees) &&
                areDetectedWorktreeResultsEqual(s.detectedWorktreesByRepo[r.id], mergedDetected) &&
                removedIds.length === 0
              ) {
                return s
              }
              return {
                worktreesByRepo: { ...s.worktreesByRepo, [r.id]: mergedWorktrees },
                detectedWorktreesByRepo: { ...s.detectedWorktreesByRepo, [r.id]: mergedDetected },
                sortEpoch: s.sortEpoch + 1,
                ...(removedIds.length > 0 ? buildWorktreePurgeState(s, removedIds) : {})
              }
            })
          } catch (err) {
            if (notifyRuntimeScopeForbiddenIfNeeded(err)) {
              return
            }
            console.error(`Failed to fetch worktrees for repo ${r.id}:`, err)
          }
        })
        return
      }

      // Why: users upgrading from a pre-fix build may have persisted
      // tabsByWorktree entries for worktrees that were deleted in the previous
      // session. Without the hydration-time purge below those entries would
      // keep zombie PTYs misclassified as "bound" in SessionsStatusSegment
      // (design §2c), which means the user would still need a second restart
      // post-upgrade to reclaim memory.
      //
      // Safety gate: fetchWorktrees swallows IPC errors and short-circuits on
      // empty-replace when cached data exists. Neither signal bubbles up to the
      // caller, so we probe the IPC directly to get the per-repo success signal,
      // then apply that same payload to state instead of listing each repo again.
      const results = await mapReposForWorktreeRefresh(
        repos,
        async (
          r
        ): Promise<
          | { repoId: string; ok: boolean; detected: DetectedWorktreeListResult }
          | { repoId: string; ok: false }
        > => {
          try {
            const requestStartedState = get()
            const requestStartedWorktrees = requestStartedState.worktreesByRepo[r.id]
            const hostId = getRepoExecutionHostId(r)
            const setup = getProjectHostSetupForRepoHost(requestStartedState, r.id, hostId)
            const detected = await listDetectedWorktreesForRepoCoalesced(
              settingsForKnownRepoOwner(requestStartedState.settings, r),
              r.id,
              { executionHostId: hostId, reuseRecentCompatibilityFailure: true }
            )
            let incoming = toVisibleWorktrees(detected, hostId, setup)
            const latestState = get()
            if (repoHasExecutionHost(latestState, r.id, hostId, false)) {
              const matchOptions = worktreeHostMatchOptions(latestState, r.id, hostId)
              incoming = routeListingBranchSwitchesThroughGitIdentity({
                requestStarted: requestStartedWorktrees,
                current: latestState.worktreesByRepo[r.id],
                incoming,
                matchesRefreshHost: (worktree) =>
                  worktreeMatchesHost(worktree, hostId, matchOptions),
                hasBranchScopedReviewContext: hasBranchScopedHostedReviewContext,
                updateWorktreeGitIdentity: latestState.updateWorktreeGitIdentity
              })
            }
            const current = get().worktreesByRepo[r.id]
            const list = sanitizeHostedReviewLinksForBranchClears(incoming, current)
            const currentMatchOptions = worktreeHostMatchOptions(get(), r.id, hostId)
            const currentForHost = (current ?? []).filter((worktree) =>
              worktreeMatchesHost(worktree, hostId, currentMatchOptions)
            )
            if (
              !areWorktreesEqual(currentForHost, list) &&
              !(list.length === 0 && currentForHost.length > 0 && !detected.authoritative)
            ) {
              set((s) => {
                if (!repoHasExecutionHost(s, r.id, hostId, false)) {
                  return s
                }
                const matchOptions = worktreeHostMatchOptions(s, r.id, hostId)
                return {
                  worktreesByRepo: {
                    ...s.worktreesByRepo,
                    [r.id]: mergeWorktreesForHost(
                      s.worktreesByRepo[r.id],
                      list,
                      hostId,
                      matchOptions
                    )
                  },
                  detectedWorktreesByRepo: {
                    ...s.detectedWorktreesByRepo,
                    [r.id]: mergeDetectedWorktreesForHost(
                      s.detectedWorktreesByRepo[r.id],
                      detected,
                      hostId,
                      setup,
                      matchOptions
                    )
                  },
                  sortEpoch: s.sortEpoch + 1
                }
              })
            } else {
              set((s) => {
                if (!repoHasExecutionHost(s, r.id, hostId, false)) {
                  return s
                }
                return {
                  detectedWorktreesByRepo: {
                    ...s.detectedWorktreesByRepo,
                    [r.id]: mergeDetectedWorktreesForHost(
                      s.detectedWorktreesByRepo[r.id],
                      detected,
                      hostId,
                      setup,
                      worktreeHostMatchOptions(s, r.id, hostId)
                    )
                  }
                }
              })
            }
            return { repoId: r.id, ok: detected.authoritative, detected }
          } catch (err) {
            console.error(`Failed to fetch worktrees for repo ${r.id}:`, err)
            return { repoId: r.id, ok: false as const }
          }
        }
      )

      const hasAnyDetectedWorktree = results.some(
        (result) => 'detected' in result && result.ok && result.detected.worktrees.length > 0
      )
      const allSucceeded =
        results.length > 0 && results.every((r) => r.ok) && hasAnyDetectedWorktree
      if (!allSucceeded) {
        // Defer; try again on the next fetchAllWorktrees call.
        return
      }
      if (
        options?.hydrationPurge === 'defer' ||
        get().workspaceSessionReady === false ||
        get().hydrationSucceeded === false
      ) {
        // Why: startup first refreshes only local repos so the app can paint
        // before remote runtime timeouts. Keep the one-shot purge available for
        // the later all-host refresh, after a clean session hydrate and when
        // remote worktree ids are known too.
        return
      }
      const validIds = new Set<string>()
      // Why: folder workspaces persist terminal tabs under `folder:<id>` keys,
      // but authoritative repo scans can never return those synthetic ids.
      for (const workspace of get().folderWorkspaces ?? []) {
        validIds.add(folderWorkspaceKey(workspace.id))
      }
      for (const key of Object.keys(get().restoredRuntimeHostIdByWorkspaceSessionKey ?? {})) {
        if (parseWorkspaceKey(key)?.type === 'folder') {
          validIds.add(key)
        }
      }
      for (const result of Object.values(get().detectedWorktreesByRepo)) {
        if (!result.authoritative) {
          continue
        }
        for (const w of result.worktrees) {
          validIds.add(w.id)
        }
      }
      const stale = Object.keys(get().tabsByWorktree).filter((id) => !validIds.has(id))
      if (stale.length > 0) {
        console.warn(
          `[worktree-purge] hydration-time purge removing stale state for ${stale.length} worktree(s):`,
          stale
        )
        get().purgeWorktreeTerminalState(stale)
      }
      set({ hasHydratedWorktreePurge: true })
    }
  }
}
