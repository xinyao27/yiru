import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import { createWorktreeActivationActions } from './worktree-activation-actions'
import { createWorktreeActivityActions } from './worktree-activity-actions'
import { createWorktreeAllFetchActions } from './worktree-all-fetch-actions'
import { createWorktreeCreateActions } from './worktree-create-actions'
import { createWorktreeDeleteStateActions } from './worktree-delete-state-actions'
import { createWorktreeDetectedFetchActions } from './worktree-detected-fetch-actions'
import { createWorktreeFolderActivationActions } from './worktree-folder-activation-actions'
import { createWorktreeIdentityActions } from './worktree-identity-actions'
import { createWorktreeLineageActions } from './worktree-lineage-actions'
import { createWorktreeMetaActions } from './worktree-meta-actions'
import { createWorktreeMetaBatchActions } from './worktree-meta-batch-actions'
import { createWorktreePendingCreationActions } from './worktree-pending-creation-actions'
import { createWorktreeRecoveryActions } from './worktree-recovery-actions'
import { createWorktreeRemoveActions } from './worktree-remove-actions'
import { createWorktreeRepoFetchActions } from './worktree-repo-fetch-actions'
export { WORKTREE_REFRESH_CONCURRENCY } from './worktree-refresh-model'

import type { WorktreeSlice } from './worktree-state'
export type { WorktreeSlice, WorktreeDeleteState } from './worktree-state'

// Why: old runtime hosts only have `worktree.list`; preserve the large-list
// UI hydration parity this slice used before `worktree.detectedList` existed.
export const createWorktreeSlice: StateCreator<AppState, [], [], WorktreeSlice> = (set, get) => ({
  worktreesByRepo: {},
  detectedWorktreesByRepo: {},
  worktreeLineageById: {},
  workspaceLineageByChildKey: {},
  activeWorktreeId: null,
  activeWorkspaceKey: null,
  pendingWorktreeCreations: {},
  activePendingCreationId: null,
  renamingWorktreeId: null,
  deleteStateByWorktreeId: {},
  baseStatusByWorktreeId: {},
  remoteBranchConflictByWorktreeId: {},
  sortEpoch: 0,
  everActivatedWorktreeIds: new Set<string>(),
  lastVisitedAtByWorktreeId: {},
  hasHydratedWorktreePurge: false,

  ...createWorktreeDetectedFetchActions(set, get),

  ...createWorktreeRepoFetchActions(set, get),

  ...createWorktreeAllFetchActions(set, get),

  ...createWorktreeLineageActions(set, get),
  ...createWorktreeCreateActions(set, get),
  ...createWorktreePendingCreationActions(set, get),
  ...createWorktreeRemoveActions(set, get),

  ...createWorktreeDeleteStateActions(set, get),
  ...createWorktreeMetaActions(set, get),
  ...createWorktreeMetaBatchActions(set, get),
  ...createWorktreeActivityActions(set, get),
  ...createWorktreeActivationActions(set, get),
  ...createWorktreeRecoveryActions(set, get),
  ...createWorktreeFolderActivationActions(set, get),

  ...createWorktreeIdentityActions(set, get)
})
