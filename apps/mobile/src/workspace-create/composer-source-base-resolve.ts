import type { GitHubPrStartPoint } from '@yiru/workbench-model/workspace'

import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

// The resolved start point for a linked PR/MR: the base branch to create from
// plus the optional review-compare ref, push target, and exact branch name.
export type ComposerHostedBase = Pick<
  GitHubPrStartPoint,
  'baseBranch' | 'compareBaseRef' | 'pushTarget' | 'branchNameOverride' | 'maintainerCanModify'
>

// Resolves a GitHub PR's base via worktree.resolvePrBase, mirroring desktop's
// select-time resolution. The runtime returns a soft { error } payload rather
// than an RPC error for provider failures.
export async function resolveComposerPrBase(args: {
  client: RpcClient
  repoId: string
  prNumber: number
  headRefName?: string
  baseRefName?: string
  isCrossRepository?: boolean
}): Promise<GitHubPrStartPoint> {
  const { client, repoId, prNumber, headRefName, baseRefName, isCrossRepository } = args
  const result = await callRuntimeOrpc(
    client,
    (runtime) => runtime.worktree.resolvePrBase,
    {
      repo: `id:${repoId}`,
      prNumber,
      ...(headRefName ? { headRefName } : {}),
      ...(baseRefName ? { baseRefName } : {}),
      ...(isCrossRepository !== undefined ? { isCrossRepository } : {})
    },
    { timeoutMs: 30_000 }
  )
  if ('error' in result) {
    throw new Error(result.error)
  }
  return result
}

// Resolves a GitLab MR's base via worktree.resolveMrBase.
export async function resolveComposerMrBase(args: {
  client: RpcClient
  repoId: string
  mrIid: number
  sourceBranch?: string
  targetBranch?: string
  isCrossRepository?: boolean
}): Promise<ComposerHostedBase> {
  const { client, repoId, mrIid, sourceBranch, targetBranch, isCrossRepository } = args
  const result = await callRuntimeOrpc(
    client,
    (runtime) => runtime.worktree.resolveMrBase,
    {
      repo: `id:${repoId}`,
      mrIid,
      ...(sourceBranch ? { sourceBranch } : {}),
      ...(targetBranch ? { targetBranch } : {}),
      ...(isCrossRepository !== undefined ? { isCrossRepository } : {})
    },
    { timeoutMs: 30_000 }
  )
  if ('error' in result) {
    throw new Error(result.error)
  }
  return result
}
