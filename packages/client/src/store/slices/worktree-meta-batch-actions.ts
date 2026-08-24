import type { StateCreator } from 'zustand'
import type { WorktreeMeta } from '~shared/types'
import { getActiveSidebarWorkspaceId, parseWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'
import {
  applyDetectedWorktreeUpdates,
  isRuntimeSelectorNotFoundError
} from './worktree-known-model'
import { persistWorktreeMeta } from './worktree-review-resolver'
import { settingsForWorktreeOwner } from './worktree-runtime-list-model'
import { applyWorktreeUpdates, getRepoIdFromWorktreeId, type WorktreeSlice } from './worktree-state'

export function createWorktreeMetaBatchActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'updateWorktreesMeta' | 'setWorktreesPinnedAndReveal'> {
  return {
    updateWorktreesMeta: async (updatesByWorktreeId) => {
      if (updatesByWorktreeId.size === 0) {
        return
      }

      set((s) => {
        let nextWorktrees = s.worktreesByRepo
        let nextDetectedWorktrees = s.detectedWorktreesByRepo
        for (const [worktreeId, updates] of updatesByWorktreeId) {
          nextWorktrees = applyWorktreeUpdates(nextWorktrees, worktreeId, updates)
          nextDetectedWorktrees = applyDetectedWorktreeUpdates(
            nextDetectedWorktrees,
            worktreeId,
            updates
          )
        }
        return nextWorktrees === s.worktreesByRepo &&
          nextDetectedWorktrees === s.detectedWorktreesByRepo
          ? {}
          : {
              ...(nextWorktrees !== s.worktreesByRepo
                ? { worktreesByRepo: nextWorktrees, sortEpoch: s.sortEpoch + 1 }
                : {}),
              ...(nextDetectedWorktrees !== s.detectedWorktreesByRepo
                ? { detectedWorktreesByRepo: nextDetectedWorktrees }
                : {})
            }
      })

      await Promise.all(
        Array.from(updatesByWorktreeId, async ([worktreeId, updates]) => {
          try {
            await persistWorktreeMeta(
              settingsForWorktreeOwner(get(), worktreeId),
              worktreeId,
              updates
            )
          } catch (err) {
            if (isRuntimeSelectorNotFoundError(err)) {
              void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
              return
            }
            console.error('Failed to update worktree meta:', err)
            void get().fetchWorktrees(getRepoIdFromWorktreeId(worktreeId))
          }
        })
      )
    },
    setWorktreesPinnedAndReveal: (worktreeIds, isPinned) => {
      // Only follow a toggled row with the viewport when it's the focused
      // worktree; pinning/unpinning an unfocused card shouldn't yank the user's
      // scroll to a row they aren't looking at.
      const activeSidebarWorktreeId = getActiveSidebarWorkspaceId(
        get().activeWorkspaceKey,
        get().activeWorktreeId
      )
      // Skip worktrees already in the target state so a no-op toggle doesn't
      // scroll the viewport away from where the user is.
      const updates = new Map<string, Partial<WorktreeMeta>>()
      let didChange = false
      let revealWorktreeId: string | null = null
      for (const worktreeId of worktreeIds) {
        const current = get().getKnownWorktreeById(worktreeId)
        if (!current || current.isPinned === isPinned) {
          continue
        }
        didChange = true
        const workspaceScope = parseWorkspaceKey(worktreeId)
        if (workspaceScope?.type === 'folder') {
          void get().updateWorktreeMeta(worktreeId, { isPinned })
        } else {
          updates.set(worktreeId, { isPinned })
        }
        if (revealWorktreeId === null && worktreeId === activeSidebarWorktreeId) {
          revealWorktreeId = worktreeId
        }
      }
      if (!didChange) {
        return
      }
      // updateWorktreesMeta applies its store update synchronously (only the
      // persistence is async), so the reveal below resolves against a render
      // where the shortcut row already exists.
      void get().updateWorktreesMeta(updates)
      if (revealWorktreeId !== null) {
        get().revealWorktreeInSidebar(revealWorktreeId, { behavior: 'smooth', highlight: true })
      }
    }
  }
}
