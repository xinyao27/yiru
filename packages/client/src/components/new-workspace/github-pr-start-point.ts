import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import type { GitHubPrStartPoint, GlobalSettings } from '~shared/types'

type PrStartPointSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

export type GitHubPrStartPointInput = {
  repoId: string
  prNumber: number
  settings: PrStartPointSettings
  headRefName?: string
  baseRefName?: string
  isCrossRepository?: boolean
}

export async function resolveGitHubPrStartPointForRepo({
  repoId,
  prNumber,
  settings,
  headRefName,
  baseRefName,
  isCrossRepository
}: GitHubPrStartPointInput): Promise<GitHubPrStartPoint> {
  const target = getActiveRuntimeTarget(settings)
  const prFields = {
    prNumber,
    ...(headRefName ? { headRefName } : {}),
    ...(baseRefName ? { baseRefName } : {}),
    ...(isCrossRepository !== undefined ? { isCrossRepository } : {})
  }
  const result =
    target.kind === 'local'
      ? await workspaceHostClient.worktrees.resolvePrBase({ repoId, ...prFields })
      : await callRuntimeOrpc(
          target,
          (client) => client.worktree.resolvePrBase,
          { repo: repoId, ...prFields },
          { timeoutMs: 30_000 }
        )
  if ('error' in result) {
    throw new Error(result.error)
  }
  return result
}
