import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  WorktreeArchiveInputSchema,
  WorktreeArchiveListInputSchema,
  WorktreeArchiveRestoreInputSchema,
  type RuntimeWorktreeArchive
} from './worktree-archive.js'
import {
  WorktreeActivateInputSchema,
  WorktreeCreateInputSchema,
  WorktreeDetectedListInputSchema,
  WorktreeForceDeleteBranchInputSchema,
  WorktreeListInputSchema,
  WorktreePrefetchCreateBaseInputSchema,
  WorktreePsInputSchema,
  WorktreeRemoveInputSchema,
  WorktreeResolveMrBaseInputSchema,
  WorktreeResolvePrBaseInputSchema,
  WorktreeSelectorInputSchema,
  WorktreeSetInputSchema,
  WorktreeSortOrderInputSchema
} from './worktree-input.js'
import type {
  RuntimeDetectedWorktreeListResult,
  RuntimeWorktreeActivateResult,
  RuntimeWorktreeCreateResult,
  RuntimeWorktreeForceDeleteBranchResult,
  RuntimeWorktreeLineageListResult,
  RuntimeWorktreeListResult,
  RuntimeWorktreeMrBaseResult,
  RuntimeWorktreePersistSortOrderResult,
  RuntimeWorktreePrefetchResult,
  RuntimeWorktreePrBaseResult,
  RuntimeWorktreePsResult,
  RuntimeWorktreeRemoveResult,
  RuntimeWorktreeShowResult,
  RuntimeWorktreeSleepResult,
  RuntimeWorktreeStateSubscriptionEvent
} from './worktree-types.js'

const PROJECT_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const PROJECT_CONTROL_ACCESS = { scope: 'project', tier: 'control' } as const
const PROJECT_HOST_ACCESS = { scope: 'project', tier: 'host' } as const
const WORKTREE_CONTROL_ACCESS = { scope: 'worktree', tier: 'control' } as const
const MOBILE = { mobile: true } as const

export const worktreeContract = {
  archive: withAccess(PROJECT_HOST_ACCESS)
    .input(WorktreeArchiveInputSchema)
    .output(type<{ archive: RuntimeWorktreeArchive; revision: number }>()),
  ps: withAccess(PROJECT_READ_ACCESS, MOBILE)
    .input(WorktreePsInputSchema)
    .output(type<RuntimeWorktreePsResult>()),
  list: withAccess(PROJECT_READ_ACCESS)
    .input(WorktreeListInputSchema)
    .output(type<RuntimeWorktreeListResult>()),
  listArchives: withAccess(PROJECT_READ_ACCESS)
    .input(WorktreeArchiveListInputSchema)
    .output(type<{ archives: RuntimeWorktreeArchive[] }>()),
  detectedList: withAccess(PROJECT_READ_ACCESS)
    .input(WorktreeDetectedListInputSchema)
    .output(type<RuntimeDetectedWorktreeListResult>()),
  lineageList: withAccess(PROJECT_READ_ACCESS).output(type<RuntimeWorktreeLineageListResult>()),
  show: withAccess(PROJECT_READ_ACCESS, MOBILE)
    .input(WorktreeSelectorInputSchema)
    .output(type<RuntimeWorktreeShowResult>()),
  sleep: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE)
    .input(WorktreeSelectorInputSchema)
    .output(type<RuntimeWorktreeSleepResult>()),
  activate: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE)
    .input(WorktreeActivateInputSchema)
    .output(type<RuntimeWorktreeActivateResult>()),
  create: withAccess(PROJECT_HOST_ACCESS, MOBILE)
    .input(WorktreeCreateInputSchema)
    .output(type<RuntimeWorktreeCreateResult>()),
  prefetchCreateBase: withAccess(PROJECT_CONTROL_ACCESS, MOBILE)
    .input(WorktreePrefetchCreateBaseInputSchema)
    .output(type<RuntimeWorktreePrefetchResult>()),
  set: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE)
    .input(WorktreeSetInputSchema)
    .output(type<RuntimeWorktreeShowResult>()),
  persistSortOrder: withAccess(PROJECT_CONTROL_ACCESS)
    .input(WorktreeSortOrderInputSchema)
    .output(type<RuntimeWorktreePersistSortOrderResult>()),
  resolvePrBase: withAccess(PROJECT_READ_ACCESS, MOBILE)
    .input(WorktreeResolvePrBaseInputSchema)
    .output(type<RuntimeWorktreePrBaseResult>()),
  resolveMrBase: withAccess(PROJECT_READ_ACCESS, MOBILE)
    .input(WorktreeResolveMrBaseInputSchema)
    .output(type<RuntimeWorktreeMrBaseResult>()),
  rm: withAccess(PROJECT_HOST_ACCESS, MOBILE)
    .input(WorktreeRemoveInputSchema)
    .output(type<RuntimeWorktreeRemoveResult>()),
  restoreArchive: withAccess(PROJECT_HOST_ACCESS)
    .input(WorktreeArchiveRestoreInputSchema)
    .output(type<{ archive: RuntimeWorktreeArchive; revision: number }>()),
  forceDeleteBranch: withAccess(PROJECT_HOST_ACCESS, MOBILE)
    .input(WorktreeForceDeleteBranchInputSchema)
    .output(type<RuntimeWorktreeForceDeleteBranchResult>()),
  // Why: main-memory-only (never persisted) full CLI output of the last
  // branch auto-rename generation failure. Worktree scope because it is keyed
  // to one worktree's rename attempt, not the whole project.
  branchRenameFailureOutput: withAccess({ scope: 'worktree', tier: 'read' })
    .input(WorktreeSelectorInputSchema)
    .output(type<string | null>()),
  // Why: one stream for the worktree state signals the shell gets over IPC —
  // base drift, remote-branch conflicts, and HEAD identity refreshes. Host
  // scope because the feed spans every repo on the machine.
  stateEvents: {
    subscribe: withAccess({ scope: 'host', tier: 'read' }, { mobile: true })
      .input(type<void>())
      .output(eventIterator(type<RuntimeWorktreeStateSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  WorktreeActivateInputSchema,
  WorktreeCreateInputSchema,
  WorktreeDetectedListInputSchema,
  WorktreeForceDeleteBranchInputSchema,
  WorktreeListInputSchema,
  WorktreePrefetchCreateBaseInputSchema,
  WorktreePsInputSchema,
  WorktreeRemoveInputSchema,
  WorktreeResolveMrBaseInputSchema,
  WorktreeResolvePrBaseInputSchema,
  WorktreeSelectorInputSchema,
  WorktreeSetInputSchema,
  WorktreeSortOrderInputSchema
} from './worktree-input.js'
export {
  WorktreeArchiveInputSchema,
  WorktreeArchiveListInputSchema,
  WorktreeArchiveRestoreInputSchema
} from './worktree-archive.js'
export type {
  WorktreeActivateInput,
  WorktreeCreateInput,
  WorktreeDetectedListInput,
  WorktreeForceDeleteBranchInput,
  WorktreeListInput,
  WorktreePrefetchCreateBaseInput,
  WorktreePsInput,
  WorktreeRemoveInput,
  WorktreeResolveMrBaseInput,
  WorktreeResolvePrBaseInput,
  WorktreeSelectorInput,
  WorktreeSetInput,
  WorktreeSortOrderInput
} from './worktree-input.js'
export type {
  RuntimeWorktreeArchive,
  WorktreeArchiveInput,
  WorktreeArchiveListInput,
  WorktreeArchiveRestoreInput
} from './worktree-archive.js'
export type {
  RuntimeDetectedWorktreeListResult,
  RuntimeWorktreeActivateResult,
  RuntimeWorktreeCreateResult,
  RuntimeWorktreeForceDeleteBranchResult,
  RuntimeWorktreeLineageListResult,
  RuntimeWorktreeListResult,
  RuntimeWorktreeMrBaseResult,
  RuntimeWorktreePersistSortOrderResult,
  RuntimeWorktreePrefetchResult,
  RuntimeWorktreePrBaseResult,
  RuntimeWorktreePsResult,
  RuntimeWorktreeRecord,
  RuntimeWorktreeRemoveResult,
  RuntimeWorktreeShowResult,
  RuntimeWorktreeSleepResult,
  RuntimeWorktreeLineage,
  RuntimeWorkspaceLineage,
  RuntimeWorktreeStateEvent,
  RuntimeWorktreeStateSubscriptionEvent,
  WorktreeBaseStatusEvent,
  WorktreeBaseStatusKind,
  WorktreeRemoteBranchConflictEvent
} from './worktree-types.js'
