import { isPositiveHostedReviewNumber } from '@yiru/runtime-protocol/model/review'
import type { Worktree, GitPushTarget, WorktreeMeta } from '@yiru/runtime-protocol/workbench/types'
import { readWorktreeMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterWorktreeMutation } from '~renderer/project-catalog/mutation-refresh'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { AppState } from '../../store/types'
import { encodePushTargetClearForRuntimeRpc } from './review-state'
import { getRepoIdFromWorktreeId } from './types'

export async function persistWorktreeMeta(
  settings: AppState['settings'],
  worktreeId: string,
  updates: Partial<WorktreeMeta>
): Promise<void> {
  const target = getActiveRuntimeTarget(settings)
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const expectedRevision = readWorktreeMutationRevision(target, repoId)
  if (target.kind === 'local') {
    const result = await workspaceHostClient.worktrees.updateMeta({
      expectedRevision,
      worktreeId,
      updates
    })
    await refreshAfterWorktreeMutation(target, repoId, result.revision)
    return
  }
  const result = await callRuntimeOrpc(
    target,
    (client) => client.worktree.set,
    {
      expectedRevision,
      worktree: toRuntimeWorktreeSelector(worktreeId),
      ...encodePushTargetClearForRuntimeRpc(updates)
    },
    { timeoutMs: 15_000 }
  )
  await refreshAfterWorktreeMutation(target, repoId, result.revision)
}

export async function resolveGitHubReviewPushTarget(
  settings: AppState['settings'],
  repoId: string,
  prNumber: number
): Promise<GitPushTarget | undefined> {
  try {
    const target = getActiveRuntimeTarget(settings)
    const result =
      target.kind === 'local'
        ? await workspaceHostClient.worktrees.resolvePrBase({ repoId, prNumber })
        : await callRuntimeOrpc(
            target,
            (client) => client.worktree.resolvePrBase,
            { repo: repoId, prNumber },
            { timeoutMs: 30_000 }
          )
    if ('error' in result) {
      console.warn(`Failed to resolve push target for PR #${prNumber}: ${result.error}`)
      return undefined
    }
    return result.pushTarget
  } catch (error) {
    console.warn(
      `Failed to resolve push target for PR #${prNumber}:`,
      error instanceof Error ? error.message : error
    )
    return undefined
  }
}

export async function resolveGitLabReviewPushTarget(
  settings: AppState['settings'],
  repoId: string,
  mrIid: number
): Promise<GitPushTarget | undefined> {
  try {
    const target = getActiveRuntimeTarget(settings)
    const result =
      target.kind === 'local'
        ? await workspaceHostClient.worktrees.resolveMrBase({ repoId, mrIid })
        : await callRuntimeOrpc(
            target,
            (client) => client.worktree.resolveMrBase,
            { repo: repoId, mrIid },
            { timeoutMs: 30_000 }
          )
    if ('error' in result) {
      console.warn(`Failed to resolve push target for MR !${mrIid}: ${result.error}`)
      return undefined
    }
    return result.pushTarget
  } catch (error) {
    console.warn(
      `Failed to resolve push target for MR !${mrIid}:`,
      error instanceof Error ? error.message : error
    )
    return undefined
  }
}

export function getHostedReviewPushTargetLookup(worktree: Worktree): {
  key: string
  resolve: (settings: AppState['settings']) => Promise<GitPushTarget | undefined>
} | null {
  const hostScope = worktree.hostId ?? ''
  if (isPositiveHostedReviewNumber(worktree.linkedPR)) {
    const prNumber = worktree.linkedPR
    return {
      key: `${worktree.id}:${hostScope}:github:${prNumber}`,
      resolve: (settings) => resolveGitHubReviewPushTarget(settings, worktree.repoId, prNumber)
    }
  }
  if (isPositiveHostedReviewNumber(worktree.linkedGitLabMR)) {
    const mrIid = worktree.linkedGitLabMR
    return {
      key: `${worktree.id}:${hostScope}:gitlab:${mrIid}`,
      resolve: (settings) => resolveGitLabReviewPushTarget(settings, worktree.repoId, mrIid)
    }
  }
  return null
}
