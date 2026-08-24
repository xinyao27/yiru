import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import {
  repoHostId,
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
import { refreshRemoteWorktreeLineageBestEffort } from './worktree-lineage-model'
import { routeListingBranchSwitchesThroughGitIdentity } from './worktree-listing-branch-switch'
import { buildWorktreePurgeState } from './worktree-purge-state'
import { areWorktreesEqual, areDetectedWorktreeResultsEqual } from './worktree-refresh-model'
import {
  hasBranchScopedHostedReviewContext,
  sanitizeHostedReviewLinksForBranchClears
} from './worktree-review-state'
import {
  settingsForRepoOwner,
  listDetectedWorktreesForRepoCoalesced
} from './worktree-runtime-list-model'
import type { WorktreeSlice } from './worktree-state'

export function createWorktreeRepoFetchActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'fetchWorktrees'> {
  return {
    fetchWorktrees: async (repoId, options) => {
      try {
        const ownerState = get()
        const requestStartedWorktrees = ownerState.worktreesByRepo[repoId]
        const hostId = repoHostId(ownerState, repoId)
        const ownerWasMissingAtStart = !ownerState.repos.some((repo) => repo.id === repoId)
        const setup = getProjectHostSetupForRepoHost(ownerState, repoId, hostId)
        const settings = settingsForRepoOwner(ownerState, repoId, hostId)
        const detected = await listDetectedWorktreesForRepoCoalesced(settings, repoId, {
          executionHostId: hostId,
          requireAuthoritative: options?.requireAuthoritative
        })
        if (options?.requireAuthoritative && !detected.authoritative) {
          return false
        }
        let incoming = toVisibleWorktrees(detected, hostId, setup)
        const latestState = get()
        if (repoHasExecutionHost(latestState, repoId, hostId, ownerWasMissingAtStart)) {
          const matchOptions = worktreeHostMatchOptions(latestState, repoId, hostId)
          incoming = routeListingBranchSwitchesThroughGitIdentity({
            requestStarted: requestStartedWorktrees,
            current: latestState.worktreesByRepo[repoId],
            incoming,
            matchesRefreshHost: (worktree) => worktreeMatchesHost(worktree, hostId, matchOptions),
            hasBranchScopedReviewContext: hasBranchScopedHostedReviewContext,
            updateWorktreeGitIdentity: latestState.updateWorktreeGitIdentity
          })
        }
        const current = get().worktreesByRepo[repoId]
        const worktrees = sanitizeHostedReviewLinksForBranchClears(incoming, current)
        const currentMatchOptions = worktreeHostMatchOptions(get(), repoId, hostId)
        const currentForHost = (current ?? []).filter((worktree) =>
          worktreeMatchesHost(worktree, hostId, currentMatchOptions)
        )
        if (areWorktreesEqual(currentForHost, worktrees)) {
          set((s) => {
            if (!repoHasExecutionHost(s, repoId, hostId, ownerWasMissingAtStart)) {
              return s
            }
            const matchOptions = worktreeHostMatchOptions(s, repoId, hostId)
            const removedIds = getRemovedWorktreeIdsAfterAuthoritativeScan(
              s,
              repoId,
              detected,
              hostId
            )
            const mergedDetected = mergeDetectedWorktreesForHost(
              s.detectedWorktreesByRepo[repoId],
              detected,
              hostId,
              setup,
              matchOptions
            )
            const mergedWorktrees = mergeWorktreesForHost(
              s.worktreesByRepo[repoId],
              worktrees,
              hostId,
              matchOptions
            )
            const worktreesChanged = !areWorktreesEqual(s.worktreesByRepo[repoId], mergedWorktrees)
            if (
              !worktreesChanged &&
              areDetectedWorktreeResultsEqual(s.detectedWorktreesByRepo[repoId], mergedDetected) &&
              removedIds.length === 0
            ) {
              return s
            }
            return {
              worktreesByRepo: {
                ...s.worktreesByRepo,
                [repoId]: mergedWorktrees
              },
              detectedWorktreesByRepo: {
                ...s.detectedWorktreesByRepo,
                [repoId]: mergedDetected
              },
              ...(worktreesChanged ? { sortEpoch: s.sortEpoch + 1 } : {}),
              ...(removedIds.length > 0 ? buildWorktreePurgeState(s, removedIds) : {})
            }
          })
          await refreshRemoteWorktreeLineageBestEffort(settings, set)
          return detected.authoritative
        }

        // Why: `git worktree list` can fail transiently (e.g. concurrent git
        // operations holding a lock, disk I/O hiccup). The backend catches these
        // errors and returns []. Replacing a known-good worktree list with []
        // causes tabsByWorktree entries to become orphaned — the agent activity
        // badge then shows raw worktree IDs instead of display names, and click-
        // to-navigate silently fails because findWorktreeById returns undefined.
        // Keep the stale-but-correct data until the next successful refresh.
        if (!detected.authoritative && worktrees.length === 0 && currentForHost.length > 0) {
          set((s) => {
            if (!repoHasExecutionHost(s, repoId, hostId, ownerWasMissingAtStart)) {
              return s
            }
            return {
              detectedWorktreesByRepo: {
                ...s.detectedWorktreesByRepo,
                [repoId]: mergeDetectedWorktreesForHost(
                  s.detectedWorktreesByRepo[repoId],
                  detected,
                  hostId,
                  setup,
                  worktreeHostMatchOptions(s, repoId, hostId)
                )
              }
            }
          })
          return false
        }

        set((s) => {
          if (!repoHasExecutionHost(s, repoId, hostId, ownerWasMissingAtStart)) {
            return s
          }
          // Why: hidden worktrees are not in worktreesByRepo. Purge decisions
          // must diff against the previous authoritative detected list so hiding
          // does not delete state, and deleting a hidden worktree still does.
          const matchOptions = worktreeHostMatchOptions(s, repoId, hostId)
          const removedIds = getRemovedWorktreeIdsAfterAuthoritativeScan(
            s,
            repoId,
            detected,
            hostId
          )
          const mergedWorktrees = mergeWorktreesForHost(
            s.worktreesByRepo[repoId],
            worktrees,
            hostId,
            matchOptions
          )
          const mergedDetected = mergeDetectedWorktreesForHost(
            s.detectedWorktreesByRepo[repoId],
            detected,
            hostId,
            setup,
            matchOptions
          )

          return {
            // Why: active worktrees can change branches entirely from a terminal.
            // We refresh that live git identity into renderer state, but only bump
            // sortEpoch when git actually reports a different worktree payload.
            worktreesByRepo: { ...s.worktreesByRepo, [repoId]: mergedWorktrees },
            detectedWorktreesByRepo: { ...s.detectedWorktreesByRepo, [repoId]: mergedDetected },
            sortEpoch: s.sortEpoch + 1,
            ...(removedIds.length > 0 ? buildWorktreePurgeState(s, removedIds) : {})
          }
        })
        await refreshRemoteWorktreeLineageBestEffort(settings, set)
        return detected.authoritative
      } catch (err) {
        if (notifyRuntimeScopeForbiddenIfNeeded(err)) {
          return false
        }
        console.error(`Failed to fetch worktrees for repo ${repoId}:`, err)
        return false
      }
    }
  }
}
