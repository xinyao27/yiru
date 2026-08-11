import {
  handleGitCancelGenerateCommitMessage,
  handleGitCancelGeneratePullRequestFields,
  handleGitDiscoverCommitMessageModels,
  handleGitGenerateCommitMessage,
  handleGitGeneratePullRequestFields
} from '~main/runtime/rpc/methods/git-generation-methods'
import {
  handleGitBranchCompare,
  handleGitBranchDiff,
  handleGitCheckIgnored,
  handleGitCommitCompare,
  handleGitCommitDiff,
  handleGitConflictOperation,
  handleGitDiff,
  handleGitHistory,
  handleGitFindHugeFoldersToIgnore,
  handleGitLocalBranches,
  handleGitRemoteCommitUrl,
  handleGitRemoteFileUrl,
  handleGitStatus,
  handleGitSubmoduleStatus
} from '~main/runtime/rpc/methods/git-read-methods'
import {
  handleGitFastForward,
  handleGitFetch,
  handleGitForkSync,
  handleGitPull,
  handleGitPush,
  handleGitRebaseFromBase,
  handleGitUpstreamStatus
} from '~main/runtime/rpc/methods/git-remote-methods'
import {
  handleGitBulkDiscard,
  handleGitBulkStage,
  handleGitBulkUnstage,
  handleGitDiscard,
  handleGitStage,
  handleGitUnstage
} from '~main/runtime/rpc/methods/git-staging-methods'
import {
  handleGitAbortMerge,
  handleGitAbortRebase,
  handleGitAbortRevert,
  handleGitAppendGitignore,
  handleGitAddTag,
  handleGitCheckout,
  handleGitCheckoutCommit,
  handleGitCherryPick,
  handleGitCommit,
  handleGitCreateBranch,
  handleGitDropCommit,
  handleGitMergeCommit,
  handleGitRebaseOntoCommit,
  handleGitResetToCommit,
  handleGitRevertCommit
} from '~main/runtime/rpc/methods/git-write-methods'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: the git-backed worktree operations layer — kept apart from
// source-control.ts (repo/worktree) because 45 methods across five source
// files would blow the 300-line cap if folded into one file. Split by
// concern the same way the legacy registry was (read/write/remote/generation/
// staging), one wire per handler module.
export const gitRuntimeHandlers = {
  git: {
    status: runtimeImplementation.git.status.handler(
      wireRuntimeMethod('git.status', handleGitStatus)
    ),
    checkIgnored: runtimeImplementation.git.checkIgnored.handler(
      wireRuntimeMethod('git.checkIgnored', handleGitCheckIgnored)
    ),
    findHugeFoldersToIgnore: runtimeImplementation.git.findHugeFoldersToIgnore.handler(
      wireRuntimeMethod('git.findHugeFoldersToIgnore', handleGitFindHugeFoldersToIgnore)
    ),
    appendGitignore: runtimeImplementation.git.appendGitignore.handler(
      wireRuntimeMethod('git.appendGitignore', handleGitAppendGitignore)
    ),
    submoduleStatus: runtimeImplementation.git.submoduleStatus.handler(
      wireRuntimeMethod('git.submoduleStatus', handleGitSubmoduleStatus)
    ),
    history: runtimeImplementation.git.history.handler(
      wireRuntimeMethod('git.history', handleGitHistory)
    ),
    conflictOperation: runtimeImplementation.git.conflictOperation.handler(
      wireRuntimeMethod('git.conflictOperation', handleGitConflictOperation)
    ),
    abortMerge: runtimeImplementation.git.abortMerge.handler(
      wireRuntimeMethod('git.abortMerge', handleGitAbortMerge)
    ),
    abortRebase: runtimeImplementation.git.abortRebase.handler(
      wireRuntimeMethod('git.abortRebase', handleGitAbortRebase)
    ),
    abortRevert: runtimeImplementation.git.abortRevert.handler(
      wireRuntimeMethod('git.abortRevert', handleGitAbortRevert)
    ),
    addTag: runtimeImplementation.git.addTag.handler(
      wireRuntimeMethod('git.addTag', handleGitAddTag)
    ),
    createBranch: runtimeImplementation.git.createBranch.handler(
      wireRuntimeMethod('git.createBranch', handleGitCreateBranch)
    ),
    checkoutCommit: runtimeImplementation.git.checkoutCommit.handler(
      wireRuntimeMethod('git.checkoutCommit', handleGitCheckoutCommit)
    ),
    cherryPick: runtimeImplementation.git.cherryPick.handler(
      wireRuntimeMethod('git.cherryPick', handleGitCherryPick)
    ),
    revertCommit: runtimeImplementation.git.revertCommit.handler(
      wireRuntimeMethod('git.revertCommit', handleGitRevertCommit)
    ),
    dropCommit: runtimeImplementation.git.dropCommit.handler(
      wireRuntimeMethod('git.dropCommit', handleGitDropCommit)
    ),
    mergeCommit: runtimeImplementation.git.mergeCommit.handler(
      wireRuntimeMethod('git.mergeCommit', handleGitMergeCommit)
    ),
    rebaseOntoCommit: runtimeImplementation.git.rebaseOntoCommit.handler(
      wireRuntimeMethod('git.rebaseOntoCommit', handleGitRebaseOntoCommit)
    ),
    resetToCommit: runtimeImplementation.git.resetToCommit.handler(
      wireRuntimeMethod('git.resetToCommit', handleGitResetToCommit)
    ),
    checkout: runtimeImplementation.git.checkout.handler(
      wireRuntimeMethod('git.checkout', handleGitCheckout)
    ),
    localBranches: runtimeImplementation.git.localBranches.handler(
      wireRuntimeMethod('git.localBranches', handleGitLocalBranches)
    ),
    diff: runtimeImplementation.git.diff.handler(wireRuntimeMethod('git.diff', handleGitDiff)),
    branchCompare: runtimeImplementation.git.branchCompare.handler(
      wireRuntimeMethod('git.branchCompare', handleGitBranchCompare)
    ),
    commitCompare: runtimeImplementation.git.commitCompare.handler(
      wireRuntimeMethod('git.commitCompare', handleGitCommitCompare)
    ),
    upstreamStatus: runtimeImplementation.git.upstreamStatus.handler(
      wireRuntimeMethod('git.upstreamStatus', handleGitUpstreamStatus)
    ),
    fetch: runtimeImplementation.git.fetch.handler(wireRuntimeMethod('git.fetch', handleGitFetch)),
    forkSync: runtimeImplementation.git.forkSync.handler(
      wireRuntimeMethod('git.forkSync', handleGitForkSync)
    ),
    pull: runtimeImplementation.git.pull.handler(wireRuntimeMethod('git.pull', handleGitPull)),
    fastForward: runtimeImplementation.git.fastForward.handler(
      wireRuntimeMethod('git.fastForward', handleGitFastForward)
    ),
    rebaseFromBase: runtimeImplementation.git.rebaseFromBase.handler(
      wireRuntimeMethod('git.rebaseFromBase', handleGitRebaseFromBase)
    ),
    push: runtimeImplementation.git.push.handler(wireRuntimeMethod('git.push', handleGitPush)),
    branchDiff: runtimeImplementation.git.branchDiff.handler(
      wireRuntimeMethod('git.branchDiff', handleGitBranchDiff)
    ),
    commitDiff: runtimeImplementation.git.commitDiff.handler(
      wireRuntimeMethod('git.commitDiff', handleGitCommitDiff)
    ),
    commit: runtimeImplementation.git.commit.handler(
      wireRuntimeMethod('git.commit', handleGitCommit)
    ),
    generateCommitMessage: runtimeImplementation.git.generateCommitMessage.handler(
      wireRuntimeMethod('git.generateCommitMessage', handleGitGenerateCommitMessage)
    ),
    discoverCommitMessageModels: runtimeImplementation.git.discoverCommitMessageModels.handler(
      wireRuntimeMethod('git.discoverCommitMessageModels', handleGitDiscoverCommitMessageModels)
    ),
    cancelGenerateCommitMessage: runtimeImplementation.git.cancelGenerateCommitMessage.handler(
      wireRuntimeMethod('git.cancelGenerateCommitMessage', handleGitCancelGenerateCommitMessage)
    ),
    generatePullRequestFields: runtimeImplementation.git.generatePullRequestFields.handler(
      wireRuntimeMethod('git.generatePullRequestFields', handleGitGeneratePullRequestFields)
    ),
    cancelGeneratePullRequestFields:
      runtimeImplementation.git.cancelGeneratePullRequestFields.handler(
        wireRuntimeMethod(
          'git.cancelGeneratePullRequestFields',
          handleGitCancelGeneratePullRequestFields
        )
      ),
    stage: runtimeImplementation.git.stage.handler(wireRuntimeMethod('git.stage', handleGitStage)),
    bulkStage: runtimeImplementation.git.bulkStage.handler(
      wireRuntimeMethod('git.bulkStage', handleGitBulkStage)
    ),
    unstage: runtimeImplementation.git.unstage.handler(
      wireRuntimeMethod('git.unstage', handleGitUnstage)
    ),
    bulkUnstage: runtimeImplementation.git.bulkUnstage.handler(
      wireRuntimeMethod('git.bulkUnstage', handleGitBulkUnstage)
    ),
    discard: runtimeImplementation.git.discard.handler(
      wireRuntimeMethod('git.discard', handleGitDiscard)
    ),
    bulkDiscard: runtimeImplementation.git.bulkDiscard.handler(
      wireRuntimeMethod('git.bulkDiscard', handleGitBulkDiscard)
    ),
    remoteFileUrl: runtimeImplementation.git.remoteFileUrl.handler(
      wireRuntimeMethod('git.remoteFileUrl', handleGitRemoteFileUrl)
    ),
    remoteCommitUrl: runtimeImplementation.git.remoteCommitUrl.handler(
      wireRuntimeMethod('git.remoteCommitUrl', handleGitRemoteCommitUrl)
    )
  }
} as const
