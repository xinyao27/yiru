import type { StateCreator } from 'zustand'
import { branchName } from '~renderer/lib/git-branch-name'

import type { AppState } from '../types'
import { refreshHostedReviewCard } from './hosted-review'
import { reconcileHydratedWorktreeReferences } from './worktree-hydration-reconciliation'
import {
  applyDetectedWorktreeUpdates,
  findKnownWorktreeById,
  isRuntimeSelectorNotFoundError
} from './worktree-known-model'
import { persistWorktreeMeta } from './worktree-review-resolver'
import { settingsForWorktreeOwner } from './worktree-runtime-list-model'
import { applyWorktreeUpdates, getRepoIdFromWorktreeId, type WorktreeSlice } from './worktree-state'

export function createWorktreeActivityActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<
  WorktreeSlice,
  | 'markWorktreeUnread'
  | 'observeTerminalGitHubPullRequestLink'
  | 'clearWorktreeUnread'
  | 'bumpWorktreeActivity'
  | 'markWorktreeVisited'
  | 'pruneLastVisitedTimestamps'
  | 'seedActiveWorktreeLastVisitedIfMissing'
> {
  return {
    markWorktreeUnread: (worktreeId) => {
      // Why: terminal attention should remain visible until the user engages
      // with the worktree. Interaction with a pane inside the worktree dismisses
      // the dot via clearWorktreeUnread. Worktree activation via setActiveWorktree
      // also clears isUnread as a side-effect; that path predates this PR and is
      // unaffected here.
      let shouldPersist = false
      const now = Date.now()
      set((s) => {
        const worktree = findKnownWorktreeById(s, worktreeId)
        if (!worktree || worktree.isUnread) {
          return {}
        }
        shouldPersist = true
        const nextWorktrees = applyWorktreeUpdates(s.worktreesByRepo, worktreeId, {
          isUnread: true,
          lastActivityAt: now
        })
        const nextDetectedWorktrees = applyDetectedWorktreeUpdates(
          s.detectedWorktreesByRepo,
          worktreeId,
          {
            isUnread: true,
            lastActivityAt: now
          }
        )
        return {
          ...(nextWorktrees !== s.worktreesByRepo
            ? { worktreesByRepo: nextWorktrees, sortEpoch: s.sortEpoch + 1 }
            : {}),
          ...(nextDetectedWorktrees !== s.detectedWorktreesByRepo
            ? { detectedWorktreesByRepo: nextDetectedWorktrees }
            : {})
        }
      })

      if (!shouldPersist) {
        return
      }

      void persistWorktreeMeta(settingsForWorktreeOwner(get(), worktreeId), worktreeId, {
        isUnread: true,
        lastActivityAt: now
      }).catch((err) => {
        if (isRuntimeSelectorNotFoundError(err)) {
          void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
          return
        }
        console.error('Failed to persist unread worktree state:', err)
        void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
      })
    },
    observeTerminalGitHubPullRequestLink: (worktreeId, link) => {
      const state = get()
      const worktree = findKnownWorktreeById(state, worktreeId)
      if (!worktree || worktree.isBare || worktree.isArchived) {
        return
      }
      const repo = state.repos.find((candidate) => candidate.id === worktree.repoId)
      if (!repo || (repo.kind && repo.kind !== 'git')) {
        return
      }
      if (typeof worktree.linkedPR === 'number' && worktree.linkedPR !== link.number) {
        return
      }

      const branch = branchName(worktree.branch)
      const alreadyLinked = worktree.linkedPR === link.number

      const fetchPRForBranch = get().fetchPRForBranch
      if (typeof fetchPRForBranch === 'function') {
        void fetchPRForBranch(repo.path, branch, {
          force: true,
          repoId: repo.id,
          worktreeId,
          linkedPRNumber: alreadyLinked ? link.number : null,
          fallbackPRNumber: null,
          fallbackPRSource: alreadyLinked ? null : 'explicit'
        }).then((pr) => {
          if (!alreadyLinked && pr?.number === link.number) {
            // Why: terminal output can include arbitrary PR URLs from docs,
            // agents, or logs. Persist only after branch lookup confirms it and
            // the user has not picked a different PR while lookup was in flight.
            void get().updateWorktreeMeta(
              worktreeId,
              { linkedPR: link.number },
              {
                shouldApply: (currentWorktree) =>
                  Boolean(
                    currentWorktree &&
                    !currentWorktree.isBare &&
                    !currentWorktree.isArchived &&
                    (currentWorktree.linkedPR == null || currentWorktree.linkedPR === link.number)
                  )
              }
            )
          }
        })
        return
      }

      const fetchHostedReviewForBranch = get().fetchHostedReviewForBranch
      if (typeof fetchHostedReviewForBranch === 'function') {
        // Why: full app stores always have fetchPRForBranch, which syncs the
        // GitHub hosted-review cache. Keep this only as a slice-test fallback.
        void refreshHostedReviewCard(fetchHostedReviewForBranch, {
          repoPath: repo.path,
          repoId: repo.id,
          branch,
          linkedGitHubPR: alreadyLinked ? link.number : null,
          fallbackGitHubPR: null,
          linkedGitLabMR: worktree.linkedGitLabMR ?? null
        })
      }
    },
    clearWorktreeUnread: (worktreeId) => {
      let shouldPersist = false
      set((s) => {
        const worktree = findKnownWorktreeById(s, worktreeId)
        if (!worktree || !worktree.isUnread) {
          // Why: return `s` (not `{}`) to preserve the exact object reference
          // on no-op. This matches the sibling `clearTerminalTabUnread` in
          // terminals.ts and avoids downstream selector churn on the hot path
          // (called on every keystroke and pointerdown).
          return s
        }
        shouldPersist = true
        const nextWorktrees = applyWorktreeUpdates(s.worktreesByRepo, worktreeId, {
          isUnread: false
        })
        const nextDetectedWorktrees = applyDetectedWorktreeUpdates(
          s.detectedWorktreesByRepo,
          worktreeId,
          {
            isUnread: false
          }
        )
        return {
          ...(nextWorktrees !== s.worktreesByRepo ? { worktreesByRepo: nextWorktrees } : {}),
          ...(nextDetectedWorktrees !== s.detectedWorktreesByRepo
            ? { detectedWorktreesByRepo: nextDetectedWorktrees }
            : {})
        }
      })

      if (!shouldPersist) {
        return
      }

      void persistWorktreeMeta(settingsForWorktreeOwner(get(), worktreeId), worktreeId, {
        isUnread: false
      }).catch((err) => {
        if (isRuntimeSelectorNotFoundError(err)) {
          void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
          return
        }
        console.error('Failed to persist cleared unread worktree state:', err)
        void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
      })
    },
    bumpWorktreeActivity: (worktreeId) => {
      const now = Date.now()
      let shouldPersist = false
      set((s) => {
        const worktree = findKnownWorktreeById(s, worktreeId)
        if (!worktree) {
          return {}
        }
        shouldPersist = true
        // Skip sortEpoch bump for the active worktree. Terminal events
        // (PTY spawn, PTY exit) in the active worktree are side-effects of
        // the user clicking the card or interacting with the terminal —
        // re-sorting the sidebar in response would cause the exact reorder-
        // on-click bug PR #209 intended to fix (e.g. dead-PTY reconnection
        // after generation bump triggers updateTabPtyId → here).
        // The lastActivityAt timestamp is still persisted so that the NEXT
        // meaningful sortEpoch bump (from a background worktree event) will
        // include this worktree's updated smart-sort score.
        const isActive = s.activeWorktreeId === worktreeId
        const nextWorktrees = applyWorktreeUpdates(s.worktreesByRepo, worktreeId, {
          lastActivityAt: now
        })
        const nextDetectedWorktrees = applyDetectedWorktreeUpdates(
          s.detectedWorktreesByRepo,
          worktreeId,
          {
            lastActivityAt: now
          }
        )
        return {
          ...(nextWorktrees !== s.worktreesByRepo
            ? {
                worktreesByRepo: nextWorktrees,
                ...(isActive ? {} : { sortEpoch: s.sortEpoch + 1 })
              }
            : {}),
          ...(nextDetectedWorktrees !== s.detectedWorktreesByRepo
            ? { detectedWorktreesByRepo: nextDetectedWorktrees }
            : {})
        }
      })

      if (!shouldPersist) {
        return
      }

      void persistWorktreeMeta(settingsForWorktreeOwner(get(), worktreeId), worktreeId, {
        lastActivityAt: now
      }).catch((err) => {
        if (isRuntimeSelectorNotFoundError(err)) {
          return
        }
        console.error('Failed to persist worktree activity timestamp:', err)
        void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
      })
    },
    markWorktreeVisited: (worktreeId, visitedAt) => {
      // Why: Cmd+J's empty-query ordering needs a focus-recency signal that is
      // distinct from worktree.lastActivityAt (which is driven by background
      // PTY/activity events). Monotonic: CLI- and IPC-driven activations can
      // race, so older timestamps must not regress the stored value. See
      // docs/cmd-j-empty-query-ordering.md.
      set((s) => {
        const now = visitedAt ?? Date.now()
        const prev = s.lastVisitedAtByWorktreeId[worktreeId] ?? 0
        if (!(now > prev)) {
          return {}
        }
        return {
          lastVisitedAtByWorktreeId: {
            ...s.lastVisitedAtByWorktreeId,
            [worktreeId]: now
          }
        }
      })
    },
    pruneLastVisitedTimestamps: () => {
      set((s) => {
        return reconcileHydratedWorktreeReferences({
          worktreesByRepo: s.worktreesByRepo,
          detectedWorktreesByRepo: s.detectedWorktreesByRepo,
          lastVisitedAtByWorktreeId: s.lastVisitedAtByWorktreeId,
          activeWorktreeId: s.activeWorktreeId
        })
      })
    },
    seedActiveWorktreeLastVisitedIfMissing: () => {
      set((s) => {
        const id = s.activeWorktreeId
        if (!id) {
          return {}
        }
        if (s.lastVisitedAtByWorktreeId[id] != null) {
          return {}
        }
        return {
          lastVisitedAtByWorktreeId: {
            ...s.lastVisitedAtByWorktreeId,
            [id]: Date.now()
          }
        }
      })
    }
  }
}
