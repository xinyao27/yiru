import type { z } from 'zod'
import type {
  WORKTREE_LIST_CONTRACT,
  WORKTREE_REMOVE_CONTRACT,
  WORKTREE_SET_CONTRACT
} from '~main/runtime-method-contracts/workspace-contracts'
import type {
  WorktreeDetectedListParams,
  WorktreeActivate,
  WorktreeForceDeleteBranch,
  WorktreePrefetchCreateBase,
  WorktreePsParams,
  WorktreeResolveMrBase,
  WorktreeResolvePrBase,
  WorktreeSelector,
  WorktreeSortOrder
} from '~main/runtime-method-contracts/worktree-method-params'

import type { RpcContext, RpcHandler } from '../core'
import { runWorktreeMutation } from './worktree-revision'

export const handleWorktreePs = ((params, { runtime, clientKind }) =>
  runtime.getWorktreePs(params.limit, clientKind)) satisfies RpcHandler<
  z.infer<typeof WorktreePsParams>
>

export const handleWorktreeList = ((params, { runtime }) =>
  runtime.listManagedWorktrees(params.repo, params.limit)) satisfies RpcHandler<
  z.infer<(typeof WORKTREE_LIST_CONTRACT)['params']>
>

export const handleWorktreeDetectedList = (async (params, { runtime, workspaceEventLog }) => {
  const result = await runtime.listDetectedManagedWorktrees(params.repo)
  return {
    ...result,
    ...(workspaceEventLog ? { revision: workspaceEventLog.revision(result.repoId) } : {})
  }
}) satisfies RpcHandler<z.infer<typeof WorktreeDetectedListParams>>

export const handleWorktreeLineageList = async (_params: unknown, { runtime }: RpcContext) => ({
  lineage: await runtime.listWorktreeLineage(),
  workspaceLineage: await runtime.listWorkspaceLineage()
})

export const handleWorktreeShow = (async (params, { runtime, workspaceEventLog }) => {
  const worktree = await runtime.showManagedWorktree(params.worktree)
  return {
    worktree,
    ...(workspaceEventLog ? { revision: workspaceEventLog.revision(worktree.repoId) } : {})
  }
}) satisfies RpcHandler<z.infer<typeof WorktreeSelector>>

export const handleWorktreeSleep = ((params, { runtime }) =>
  runtime.sleepManagedWorktree(params.worktree)) satisfies RpcHandler<
  z.infer<typeof WorktreeSelector>
>

export const handleWorktreeActivate = ((params, { runtime, clientKind }) =>
  runtime.activateManagedWorktree(params.worktree, {
    notifyClients: params.notifyClients !== false,
    clientKind
  })) satisfies RpcHandler<z.infer<typeof WorktreeActivate>>

export async function handleWorktreePrefetchCreateBase(
  params: z.infer<typeof WorktreePrefetchCreateBase>,
  { runtime }: RpcContext
) {
  await runtime.prefetchManagedWorktreeCreateBase({
    repoSelector: params.repo,
    baseBranch: params.baseBranch
  })
  return null
}

export async function handleWorktreeSet(
  params: z.infer<(typeof WORKTREE_SET_CONTRACT)['params']>,
  { runtime, workspaceEventLog }: RpcContext
) {
  const current = await runtime.showManagedWorktree(params.worktree)
  const lineage =
    params.parentWorktree || params.noParent === true
      ? { parentWorktree: params.parentWorktree, noParent: params.noParent === true }
      : undefined
  return runWorktreeMutation(
    workspaceEventLog,
    current.repoId,
    params.expectedRevision,
    async () => ({
      worktree: await runtime.updateManagedWorktreeMeta(params.worktree, {
        displayName: params.displayName,
        linkedPR: params.linkedPR,
        linkedGitLabMR: params.linkedGitLabMR,
        linkedBitbucketPR: params.linkedBitbucketPR,
        linkedAzureDevOpsPR: params.linkedAzureDevOpsPR,
        linkedGiteaPR: params.linkedGiteaPR,
        comment: params.comment,
        isArchived: params.isArchived,
        isUnread: params.isUnread,
        isPinned: params.isPinned,
        sortOrder: params.sortOrder,
        manualOrder: params.manualOrder,
        lastActivityAt: params.lastActivityAt,
        createdAt: params.createdAt,
        sparseDirectories: params.sparseDirectories,
        sparseBaseRef: params.sparseBaseRef,
        sparsePresetId: params.sparsePresetId,
        baseRef: params.baseRef,
        workspaceStatus: params.workspaceStatus,
        pushTarget: params.pushTarget,
        diffComments: params.diffComments,
        mobileDiffReview: params.mobileDiffReview,
        lineage
      } as Parameters<typeof runtime.updateManagedWorktreeMeta>[1])
    }),
    ({ worktree }) => ({
      kind: 'worktree.updated',
      payload: { worktreeId: worktree.id }
    })
  )
}

export const handleWorktreePersistSortOrder = ((params, { runtime, shellConnectionId }) =>
  runtime.persistManagedWorktreeSortOrder(params.orderedIds, {
    // Why: the desktop already applied its computed order. Echoing a repo
    // invalidation back to that same shell makes it persist the order again.
    notifyClients: shellConnectionId === undefined
  })) satisfies RpcHandler<z.infer<typeof WorktreeSortOrder>>

export const handleWorktreeResolvePrBase = ((params, { runtime }) =>
  runtime.resolveManagedPrBase({
    repoSelector: params.repo,
    prNumber: params.prNumber,
    headRefName: params.headRefName,
    baseRefName: params.baseRefName,
    isCrossRepository: params.isCrossRepository
  })) satisfies RpcHandler<z.infer<typeof WorktreeResolvePrBase>>

export const handleWorktreeResolveMrBase = ((params, { runtime }) =>
  runtime.resolveManagedMrBase({
    repoSelector: params.repo,
    mrIid: params.mrIid,
    sourceBranch: params.sourceBranch,
    targetBranch: params.targetBranch,
    isCrossRepository: params.isCrossRepository
  })) satisfies RpcHandler<z.infer<typeof WorktreeResolveMrBase>>

export async function handleWorktreeRemove(
  params: z.infer<(typeof WORKTREE_REMOVE_CONTRACT)['params']>,
  { runtime, workspaceEventLog }: RpcContext
) {
  const current = await runtime.showManagedWorktree(params.worktree)
  return runWorktreeMutation(
    workspaceEventLog,
    current.repoId,
    params.expectedRevision,
    async () => ({
      removed: true,
      ...(await runtime.removeManagedWorktree(
        params.worktree,
        params.force === true,
        params.runHooks === true
      ))
    }),
    () => ({ kind: 'worktree.removed', payload: { worktreeId: current.id } })
  )
}

export const handleWorktreeForceDeleteBranch = ((params, { runtime }) =>
  runtime.forceDeletePreservedBranch(
    params.worktree,
    params.branchName,
    params.expectedHead
  )) satisfies RpcHandler<z.infer<typeof WorktreeForceDeleteBranch>>

// Why: exposes the in-memory branch-auto-rename failure output (module state
// in main/agent-hooks/branch-rename-failure-output.ts, not tied to any
// window) so paired/environment hosts can surface it too — previously
// preload-only, so remote-created worktrees could never show the full CLI
// output of their own rename failure.
export const handleWorktreeBranchRenameFailureOutput = ((params, { runtime }) =>
  runtime.getBranchRenameFailureOutputForWorktree(params.worktree)) satisfies RpcHandler<
  z.infer<typeof WorktreeSelector>
>
