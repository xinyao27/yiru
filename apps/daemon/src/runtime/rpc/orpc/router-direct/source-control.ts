import {
  handleRepoAdd,
  handleRepoBaseRefDefault,
  handleRepoClone,
  handleRepoCreate,
  handleRepoGitAvailable,
  handleRepoHooks,
  handleRepoHooksCheck,
  handleRepoList,
  handleRepoRemove,
  handleRepoRemoveSparsePreset,
  handleRepoReorder,
  handleRepoSaveSparsePreset,
  handleRepoSearchRefs,
  handleRepoSetBaseRef,
  handleRepoSetupScriptImports,
  handleRepoShow,
  handleRepoSparsePresets,
  handleRepoUpdate
} from '~main/runtime/rpc/methods/repo'
import {
  handleWorktreeActivate,
  handleWorktreeBranchRenameFailureOutput,
  handleWorktreeDetectedList,
  handleWorktreeForceDeleteBranch,
  handleWorktreeLineageList,
  handleWorktreeList,
  handleWorktreePersistSortOrder,
  handleWorktreePrefetchCreateBase,
  handleWorktreePs,
  handleWorktreeRemove,
  handleWorktreeResolveMrBase,
  handleWorktreeResolvePrBase,
  handleWorktreeSet,
  handleWorktreeShow,
  handleWorktreeSleep
} from '~main/runtime/rpc/methods/worktree'
import { handleWorktreeCreate } from '~main/runtime/rpc/methods/worktree-create'
import { handleWorktreeStateEventsSubscribe } from '~main/runtime/rpc/methods/worktree-state-events'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: repo and worktree are the git-backed source-control layer underneath
// a workspace — kept apart from workspace.ts, which manages the
// non-git-specific project/folder surfaces a repo is organized into.
export const sourceControlRuntimeHandlers = {
  repo: {
    list: runtimeImplementation.repo.list.handler(wireRuntimeMethod('repo.list', handleRepoList)),
    sparsePresets: runtimeImplementation.repo.sparsePresets.handler(
      wireRuntimeMethod('repo.sparsePresets', handleRepoSparsePresets)
    ),
    saveSparsePreset: runtimeImplementation.repo.saveSparsePreset.handler(
      wireRuntimeMethod('repo.saveSparsePreset', handleRepoSaveSparsePreset)
    ),
    removeSparsePreset: runtimeImplementation.repo.removeSparsePreset.handler(
      wireRuntimeMethod('repo.removeSparsePreset', handleRepoRemoveSparsePreset)
    ),
    add: runtimeImplementation.repo.add.handler(wireRuntimeMethod('repo.add', handleRepoAdd)),
    create: runtimeImplementation.repo.create.handler(
      wireRuntimeMethod('repo.create', handleRepoCreate)
    ),
    gitAvailable: runtimeImplementation.repo.gitAvailable.handler(
      wireRuntimeMethod('repo.gitAvailable', handleRepoGitAvailable)
    ),
    clone: runtimeImplementation.repo.clone.handler(
      wireRuntimeMethod('repo.clone', handleRepoClone)
    ),
    show: runtimeImplementation.repo.show.handler(wireRuntimeMethod('repo.show', handleRepoShow)),
    update: runtimeImplementation.repo.update.handler(
      wireRuntimeMethod('repo.update', handleRepoUpdate)
    ),
    rm: runtimeImplementation.repo.rm.handler(wireRuntimeMethod('repo.rm', handleRepoRemove)),
    reorder: runtimeImplementation.repo.reorder.handler(
      wireRuntimeMethod('repo.reorder', handleRepoReorder)
    ),
    setBaseRef: runtimeImplementation.repo.setBaseRef.handler(
      wireRuntimeMethod('repo.setBaseRef', handleRepoSetBaseRef)
    ),
    baseRefDefault: runtimeImplementation.repo.baseRefDefault.handler(
      wireRuntimeMethod('repo.baseRefDefault', handleRepoBaseRefDefault)
    ),
    searchRefs: runtimeImplementation.repo.searchRefs.handler(
      wireRuntimeMethod('repo.searchRefs', handleRepoSearchRefs)
    ),
    hooks: runtimeImplementation.repo.hooks.handler(
      wireRuntimeMethod('repo.hooks', handleRepoHooks)
    ),
    hooksCheck: runtimeImplementation.repo.hooksCheck.handler(
      wireRuntimeMethod('repo.hooksCheck', handleRepoHooksCheck)
    ),
    setupScriptImports: runtimeImplementation.repo.setupScriptImports.handler(
      wireRuntimeMethod('repo.setupScriptImports', handleRepoSetupScriptImports)
    )
  },
  worktree: {
    ps: runtimeImplementation.worktree.ps.handler(
      wireRuntimeMethod('worktree.ps', handleWorktreePs)
    ),
    list: runtimeImplementation.worktree.list.handler(
      wireRuntimeMethod('worktree.list', handleWorktreeList)
    ),
    detectedList: runtimeImplementation.worktree.detectedList.handler(
      wireRuntimeMethod('worktree.detectedList', handleWorktreeDetectedList)
    ),
    lineageList: runtimeImplementation.worktree.lineageList.handler(
      wireRuntimeMethod('worktree.lineageList', handleWorktreeLineageList)
    ),
    show: runtimeImplementation.worktree.show.handler(
      wireRuntimeMethod('worktree.show', handleWorktreeShow)
    ),
    sleep: runtimeImplementation.worktree.sleep.handler(
      wireRuntimeMethod('worktree.sleep', handleWorktreeSleep)
    ),
    activate: runtimeImplementation.worktree.activate.handler(
      wireRuntimeMethod('worktree.activate', handleWorktreeActivate)
    ),
    create: runtimeImplementation.worktree.create.handler(
      wireRuntimeMethod('worktree.create', handleWorktreeCreate)
    ),
    prefetchCreateBase: runtimeImplementation.worktree.prefetchCreateBase.handler(
      wireRuntimeMethod('worktree.prefetchCreateBase', handleWorktreePrefetchCreateBase)
    ),
    set: runtimeImplementation.worktree.set.handler(
      wireRuntimeMethod('worktree.set', handleWorktreeSet)
    ),
    persistSortOrder: runtimeImplementation.worktree.persistSortOrder.handler(
      wireRuntimeMethod('worktree.persistSortOrder', handleWorktreePersistSortOrder)
    ),
    resolvePrBase: runtimeImplementation.worktree.resolvePrBase.handler(
      wireRuntimeMethod('worktree.resolvePrBase', handleWorktreeResolvePrBase)
    ),
    resolveMrBase: runtimeImplementation.worktree.resolveMrBase.handler(
      wireRuntimeMethod('worktree.resolveMrBase', handleWorktreeResolveMrBase)
    ),
    rm: runtimeImplementation.worktree.rm.handler(
      wireRuntimeMethod('worktree.rm', handleWorktreeRemove)
    ),
    forceDeleteBranch: runtimeImplementation.worktree.forceDeleteBranch.handler(
      wireRuntimeMethod('worktree.forceDeleteBranch', handleWorktreeForceDeleteBranch)
    ),
    branchRenameFailureOutput: runtimeImplementation.worktree.branchRenameFailureOutput.handler(
      wireRuntimeMethod(
        'worktree.branchRenameFailureOutput',
        handleWorktreeBranchRenameFailureOutput
      )
    ),
    stateEvents: {
      subscribe: runtimeImplementation.worktree.stateEvents.subscribe.handler(
        wireRuntimeStream('worktree.stateEvents.subscribe', handleWorktreeStateEventsSubscribe)
      )
    }
  }
} as const
