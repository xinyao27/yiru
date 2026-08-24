import { isPositiveHostedReviewNumber } from '@yiru/workbench-model/review'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import type { Worktree, GitPushTarget, WorktreeMeta } from '~shared/types'

import type { AppState } from '../types'
import { encodePushTargetClearForRuntimeRpc } from './worktree-review-state'

export async function persistWorktreeMeta(
  settings: AppState['settings'],
  worktreeId: string,
  updates: Partial<WorktreeMeta>
): Promise<void> {
  const target = getActiveRuntimeTarget(settings)
  if (target.kind === 'local') {
    await workspaceHostClient.worktrees.updateMeta({ worktreeId, updates })
    return
  }
  await callRuntimeOrpc(
    target,
    (client) => client.worktree.set,
    {
      worktree: toRuntimeWorktreeSelector(worktreeId),
      ...encodePushTargetClearForRuntimeRpc(updates)
    },
    { timeoutMs: 15_000 }
  )
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
