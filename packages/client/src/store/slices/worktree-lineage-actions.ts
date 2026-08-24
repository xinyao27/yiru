import type { StateCreator } from 'zustand'
import { branchName } from '~renderer/lib/git-branch-name'
import type { Worktree } from '~shared/types'

import type { AppState } from '../types'
import { isRuntimeSelectorNotFoundError } from './worktree-known-model'
import {
  setWorktreeLineageForRuntime,
  applyWorktreeLineageUpdate,
  refreshWorktreeLineageForSettings
} from './worktree-lineage-model'
import { detachedHeadAutoDerivedDisplayNames } from './worktree-refresh-model'
import { persistWorktreeMeta } from './worktree-review-resolver'
import {
  CLEARED_HOSTED_REVIEW_LINK_UPDATES,
  hostedReviewLinkClearTombstonesByWorktreeId,
  hasBranchScopedHostedReviewContext,
  getHostedReviewLinkMutationGeneration,
  resolveHostedReviewLinkWorktreeId,
  hostedReviewLinksAreCleared,
  getHostedReviewLinkUpdates,
  canonicalHostedReviewBranchIdentity,
  rememberHostedReviewLinkClear,
  applyHostedReviewLinkClear
} from './worktree-review-state'
import { settingsForWorktreeOwner } from './worktree-runtime-list-model'
import { getRepoIdFromWorktreeId, type WorktreeSlice } from './worktree-state'

export function createWorktreeLineageActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<
  WorktreeSlice,
  | 'fetchWorktreeLineage'
  | 'updateWorktreeLineage'
  | 'assignWorktreeParent'
  | 'updateWorktreeGitIdentity'
  | 'updateWorktreeBaseStatus'
  | 'updateWorktreeRemoteBranchConflict'
> {
  return {
    fetchWorktreeLineage: async () => {
      try {
        // Why: lineage is a focused-host refresh — fetch from the focused host and
        // host-merge so other hosts' previously fetched lineage is preserved.
        await refreshWorktreeLineageForSettings(get().settings, set, {
          reuseRecentCompatibilityFailure: true
        })
      } catch (err) {
        console.error('Failed to fetch worktree lineage:', err)
      }
    },
    updateWorktreeLineage: async (worktreeId, args) => {
      const ownerSettings = settingsForWorktreeOwner(get(), worktreeId)
      try {
        applyWorktreeLineageUpdate(
          set,
          worktreeId,
          await setWorktreeLineageForRuntime(ownerSettings, worktreeId, args)
        )
      } catch (err) {
        console.error('Failed to update worktree lineage:', err)
        await refreshWorktreeLineageForSettings(ownerSettings, set)
      }
    },
    assignWorktreeParent: async (worktreeId, args) => {
      const ownerSettings = settingsForWorktreeOwner(get(), worktreeId)
      try {
        applyWorktreeLineageUpdate(
          set,
          worktreeId,
          await setWorktreeLineageForRuntime(ownerSettings, worktreeId, args)
        )
      } catch (err) {
        console.error('Failed to assign worktree parent:', err)
        await refreshWorktreeLineageForSettings(ownerSettings, set)
        throw err
      }
    },
    updateWorktreeGitIdentity: (worktreeId, identity) => {
      let shouldPersistHostedReviewClear = false
      let clearedBranch: string | null = null
      let clearGeneration = getHostedReviewLinkMutationGeneration(worktreeId)
      const repoId = getRepoIdFromWorktreeId(worktreeId)
      const existing = get().worktreesByRepo[repoId]?.find((worktree) => worktree.id === worktreeId)
      if (!existing) {
        return
      }
      const expectedHead = identity.head ?? existing.head
      const expectedBranch = identity.branch === null ? '' : (identity.branch ?? existing.branch)
      if (expectedHead === existing.head && expectedBranch === existing.branch) {
        return
      }

      set((s) => {
        const current = s.worktreesByRepo[repoId]
        if (!current) {
          return s
        }

        let changed = false
        const next = current.map((worktree) => {
          if (worktree.id !== worktreeId) {
            return worktree
          }
          const nextHead = identity.head ?? worktree.head
          const nextBranch = identity.branch === null ? '' : (identity.branch ?? worktree.branch)
          if (nextHead === worktree.head && nextBranch === worktree.branch) {
            return worktree
          }
          changed = true
          const hostedReviewBranchChanged =
            canonicalHostedReviewBranchIdentity(nextBranch) !==
            canonicalHostedReviewBranchIdentity(worktree.branch)
          const shouldClearHostedReviewContext =
            hostedReviewBranchChanged && hasBranchScopedHostedReviewContext(worktree)
          if (shouldClearHostedReviewContext) {
            shouldPersistHostedReviewClear = true
            clearedBranch = nextBranch
            clearGeneration = getHostedReviewLinkMutationGeneration(worktreeId)
            rememberHostedReviewLinkClear(worktreeId, nextBranch, clearGeneration, nextHead)
          } else {
            const tombstone = hostedReviewLinkClearTombstonesByWorktreeId.get(worktreeId)
            if (tombstone) {
              const nextBranchIdentity = canonicalHostedReviewBranchIdentity(nextBranch)
              hostedReviewLinkClearTombstonesByWorktreeId.set(worktreeId, {
                ...tombstone,
                branch: nextBranch,
                branchIdentity: nextBranchIdentity,
                head: nextHead
              })
              if (hostedReviewBranchChanged) {
                shouldPersistHostedReviewClear = true
                clearedBranch = nextBranch
                clearGeneration = tombstone.generation
              }
            }
          }
          // Why: terminal branch switches only patch branch/head here; auto-derived
          // titles need the same branch derivation that full worktree listing uses.
          const currentBranchName = branchName(worktree.branch)
          const wasAutoDerived = worktree.displayName === currentBranchName
          const wasDetachedAutoDerived =
            worktree.branch === '' &&
            nextBranch !== '' &&
            detachedHeadAutoDerivedDisplayNames.get(worktreeId) === worktree.displayName
          const nextDisplayName =
            (wasAutoDerived || wasDetachedAutoDerived) && nextBranch
              ? branchName(nextBranch)
              : worktree.displayName
          if (identity.branch === null && wasAutoDerived) {
            detachedHeadAutoDerivedDisplayNames.set(worktreeId, worktree.displayName)
          } else if (identity.branch !== undefined) {
            detachedHeadAutoDerivedDisplayNames.delete(worktreeId)
          }
          return {
            ...worktree,
            head: nextHead,
            branch: nextBranch,
            displayName: nextDisplayName,
            // Why: linked reviews are branch-scoped hints. If a terminal switches
            // branches, keeping the old exact link makes Checks refresh the old PR.
            ...(shouldClearHostedReviewContext ? CLEARED_HOSTED_REVIEW_LINK_UPDATES : {})
          }
        })

        if (!changed) {
          return s
        }

        return {
          worktreesByRepo: { ...s.worktreesByRepo, [repoId]: next },
          sortEpoch: s.sortEpoch + 1
        }
      })
      if (!shouldPersistHostedReviewClear || clearedBranch === null) {
        return
      }

      void Promise.resolve()
        .then(async () => {
          let currentWorktreeId = resolveHostedReviewLinkWorktreeId(worktreeId)
          const persistedWorktreeIds = new Set<string>()
          while (true) {
            currentWorktreeId = resolveHostedReviewLinkWorktreeId(currentWorktreeId)
            if (persistedWorktreeIds.has(currentWorktreeId)) {
              return
            }
            persistedWorktreeIds.add(currentWorktreeId)
            let current = get().getKnownWorktreeById(currentWorktreeId)
            if (
              !current ||
              current.branch !== clearedBranch ||
              getHostedReviewLinkMutationGeneration(currentWorktreeId) !== clearGeneration
            ) {
              return
            }
            if (!hostedReviewLinksAreCleared(current as Worktree)) {
              // Why: a worktree refetch can rehydrate stale linked-review metadata
              // before this async clear starts; clear it again instead of bailing out.
              applyHostedReviewLinkClear(set, currentWorktreeId)
              current = get().getKnownWorktreeById(currentWorktreeId)
              if (!current || current.branch !== clearedBranch) {
                return
              }
            }
            await persistWorktreeMeta(
              settingsForWorktreeOwner(get(), currentWorktreeId),
              currentWorktreeId,
              CLEARED_HOSTED_REVIEW_LINK_UPDATES
            )
            const migratedWorktreeId = resolveHostedReviewLinkWorktreeId(currentWorktreeId)
            if (migratedWorktreeId === currentWorktreeId) {
              break
            }
            // Why: worktree creation can migrate ids while this IPC is in flight;
            // persist the branch-scoped clear under the new durable id as well.
            currentWorktreeId = migratedWorktreeId
          }
          const latest = get().getKnownWorktreeById(currentWorktreeId)
          if (
            !latest ||
            latest.branch !== clearedBranch ||
            hostedReviewLinksAreCleared(latest as Worktree)
          ) {
            return
          }
          if (getHostedReviewLinkMutationGeneration(currentWorktreeId) !== clearGeneration) {
            // Why: a delayed branch-switch clear must not win over a newer manual relink.
            await persistWorktreeMeta(
              settingsForWorktreeOwner(get(), currentWorktreeId),
              currentWorktreeId,
              getHostedReviewLinkUpdates(latest as Worktree)
            )
            return
          }
          // Why: a worktree refetch can briefly rehydrate old metadata before
          // the branch-switch clear reaches disk; do not write that stale link back.
          applyHostedReviewLinkClear(set, currentWorktreeId)
        })
        .catch((err) => {
          if (isRuntimeSelectorNotFoundError(err)) {
            void get().fetchWorktrees(
              getRepoIdFromWorktreeId(resolveHostedReviewLinkWorktreeId(worktreeId))
            )
            return
          }
          console.error('Failed to persist branch-scoped review link clear:', err)
        })
    },
    updateWorktreeBaseStatus: (event) => {
      set((s) => ({
        baseStatusByWorktreeId: {
          ...s.baseStatusByWorktreeId,
          [event.worktreeId]: event
        }
      }))
    },
    updateWorktreeRemoteBranchConflict: (event) => {
      set((s) => ({
        remoteBranchConflictByWorktreeId: {
          ...s.remoteBranchConflictByWorktreeId,
          [event.worktreeId]: event
        }
      }))
    }
  }
}
