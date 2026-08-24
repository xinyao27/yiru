import type { StateCreator } from 'zustand'
import { migrateHugeRepoWarningDismissal } from '~renderer/components/workspace-panel/source-control/huge-repo-warning-dismissals'

import type { AppState } from '../types'
import { findKnownWorktreeById } from './worktree-known-model'
import { buildWorktreePurgeState } from './worktree-purge-state'
import { buildWorktreeRenameState } from './worktree-rename-state'
import { migrateHostedReviewLinkMutationGeneration } from './worktree-review-state'
import type { WorktreeSlice } from './worktree-state'

export function createWorktreeIdentityActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<
  WorktreeSlice,
  'allWorktrees' | 'getKnownWorktreeById' | 'purgeWorktreeTerminalState' | 'migrateWorktreeIdentity'
> {
  return {
    allWorktrees: () => Object.values(get().worktreesByRepo).flat(),
    getKnownWorktreeById: (worktreeId) => findKnownWorktreeById(get(), worktreeId),
    purgeWorktreeTerminalState: (worktreeIds: string[]) => {
      if (worktreeIds.length === 0) {
        return
      }
      set((s) => buildWorktreePurgeState(s, worktreeIds))
    },
    migrateWorktreeIdentity: (oldWorktreeId: string, newWorktreeId: string) => {
      if (oldWorktreeId === newWorktreeId) {
        return
      }
      // Why: invalidate pre-rename toast actions before publishing the new path,
      // while carrying the dismissal forward for the same logical worktree.
      migrateHugeRepoWarningDismissal(oldWorktreeId, newWorktreeId)
      set((s) => buildWorktreeRenameState(s, oldWorktreeId, newWorktreeId))
      migrateHostedReviewLinkMutationGeneration(oldWorktreeId, newWorktreeId)
    }
  }
}
