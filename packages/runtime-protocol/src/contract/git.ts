import { type, type ContractRouter } from '@orpc/contract'

import type { RuntimeGitLocalBranches } from '../mobile-runtime-types.js'
import type {
  GitBranchCompareResult,
  GitConflictOperation,
  GitHistoryResult,
  GitStatusResult,
  GitUpstreamStatus
} from '../model/review.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import * as generationInputs from './git-generation-inputs.js'
import * as inputs from './git-inputs.js'
import type * as results from './git-results.js'

const WORKTREE_READ_ACCESS = { scope: 'worktree', tier: 'read' } as const
const WORKTREE_CONTROL_ACCESS = { scope: 'worktree', tier: 'control' } as const
const PROJECT_CONTROL_ACCESS = { scope: 'project', tier: 'control' } as const
const PROJECT_HOST_ACCESS = { scope: 'project', tier: 'host' } as const
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const gitContract = {
  status: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitStatusInputSchema)
    .output(type<GitStatusResult>()),
  checkIgnored: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.GitCheckIgnoredInputSchema)
    .output(type<string[]>()),
  findHugeFoldersToIgnore: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitWorktreeSelectorInputSchema)
    .output(type<string[]>()),
  appendGitignore: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitAppendGitignoreInputSchema)
    .output(type<boolean>()),
  submoduleStatus: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.GitSubmoduleStatusInputSchema)
    .output(type<GitStatusResult>()),
  history: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitHistoryInputSchema)
    .output(type<GitHistoryResult>()),
  conflictOperation: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.GitWorktreeSelectorInputSchema)
    .output(type<GitConflictOperation>()),
  abortMerge: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitWorktreeSelectorInputSchema)
    .output(type<results.GitMutationResult>()),
  abortRebase: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitWorktreeSelectorInputSchema)
    .output(type<results.GitMutationResult>()),
  abortRevert: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitWorktreeSelectorInputSchema)
    .output(type<results.GitMutationResult>()),
  addTag: withAccess(PROJECT_HOST_ACCESS)
    .input(inputs.GitAddTagInputSchema)
    .output(type<results.GitAddTagResult>()),
  createBranch: withAccess(PROJECT_HOST_ACCESS)
    .input(inputs.GitCreateBranchInputSchema)
    .output(type<results.GitCreateBranchResult>()),
  checkoutCommit: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.GitCheckoutCommitInputSchema)
    .output(type<results.GitCheckoutCommitResult>()),
  cherryPick: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.GitCherryPickInputSchema)
    .output(type<results.GitConflictableWriteResult>()),
  revertCommit: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.GitRevertCommitInputSchema)
    .output(type<results.GitConflictableWriteResult>()),
  dropCommit: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.GitDropCommitInputSchema)
    .output(type<results.GitConflictableWriteResult>()),
  mergeCommit: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.GitMergeCommitInputSchema)
    .output(type<results.GitConflictableWriteResult>()),
  rebaseOntoCommit: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.GitRebaseOntoCommitInputSchema)
    .output(type<results.GitConflictableWriteResult>()),
  resetToCommit: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.GitResetToCommitInputSchema)
    .output(type<results.GitResetToCommitResult>()),
  checkout: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitCheckoutInputSchema)
    .output(type<results.GitCheckoutResult>()),
  localBranches: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitWorktreeSelectorInputSchema)
    .output(type<RuntimeGitLocalBranches>()),
  diff: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitDiffInputSchema)
    .output(type<results.GitDiffResult>()),
  branchCompare: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitBranchCompareInputSchema)
    .output(type<GitBranchCompareResult>()),
  commitCompare: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitCommitCompareInputSchema)
    .output(type<results.GitCommitCompareResult>()),
  upstreamStatus: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitTargetedRemoteInputSchema)
    .output(type<GitUpstreamStatus>()),
  fetch: withAccess(PROJECT_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitTargetedRemoteInputSchema)
    .output(type<results.GitMutationResult>()),
  forkSync: withAccess(PROJECT_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitForkSyncInputSchema)
    .output(type<results.GitForkSyncResult>()),
  pull: withAccess(PROJECT_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitTargetedRemoteInputSchema)
    .output(type<results.GitMutationResult>()),
  fastForward: withAccess(PROJECT_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitTargetedRemoteInputSchema)
    .output(type<results.GitMutationResult>()),
  rebaseFromBase: withAccess(PROJECT_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitRebaseFromBaseInputSchema)
    .output(type<results.GitMutationResult>()),
  push: withAccess(PROJECT_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitPushInputSchema)
    .output(type<results.GitMutationResult>()),
  branchDiff: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitBranchDiffInputSchema)
    .output(type<results.GitDiffResult>()),
  commitDiff: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitCommitDiffInputSchema)
    .output(type<results.GitDiffResult>()),
  commit: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitCommitInputSchema)
    .output(type<results.GitCommitResult>()),
  generateCommitMessage: withAccess(HOST_ACCESS, MOBILE_CLIENT)
    .input(generationInputs.GitGenerateCommitMessageInputSchema)
    .output(type<results.GitGenerateCommitMessageResult>()),
  discoverCommitMessageModels: withAccess(HOST_ACCESS, MOBILE_CLIENT)
    .input(generationInputs.GitDiscoverCommitMessageModelsInputSchema)
    .output(type<results.GitDiscoverCommitMessageModelsResult>()),
  cancelGenerateCommitMessage: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitWorktreeSelectorInputSchema)
    .output(type<results.GitMutationResult>()),
  generatePullRequestFields: withAccess(HOST_ACCESS, MOBILE_CLIENT)
    .input(generationInputs.GitGeneratePullRequestFieldsInputSchema)
    .output(type<results.GitGeneratePullRequestFieldsResult>()),
  cancelGeneratePullRequestFields: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitWorktreeSelectorInputSchema)
    .output(type<results.GitMutationResult>()),
  stage: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitFilePathInputSchema)
    .output(type<results.GitMutationResult>()),
  bulkStage: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitBulkPathsInputSchema)
    .output(type<results.GitMutationResult>()),
  unstage: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitFilePathInputSchema)
    .output(type<results.GitMutationResult>()),
  bulkUnstage: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitBulkPathsInputSchema)
    .output(type<results.GitMutationResult>()),
  discard: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.GitFilePathInputSchema)
    .output(type<results.GitMutationResult>()),
  bulkDiscard: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.GitBulkPathsInputSchema)
    .output(type<results.GitMutationResult>()),
  remoteFileUrl: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.GitRemoteFileUrlInputSchema)
    .output(type<string | null>()),
  remoteCommitUrl: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.GitRemoteCommitUrlInputSchema)
    .output(type<string | null>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './git-generation-inputs.js'
export * from './git-inputs.js'
export * from './git-results.js'
