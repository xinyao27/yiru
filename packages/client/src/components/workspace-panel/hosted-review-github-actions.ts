import type { GitHubMutationResult } from '@yiru/runtime-protocol/contract'
import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/workbench-model/workspace'
import { callRuntimeOrpc, type RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import type { GitHubPRMergeMethod, PRInfo, Repo } from '~shared/types'

type GitHubPRRepo = PRInfo['prRepo']

// Why: runtime-host projects mirror server paths into the desktop store, but
// desktop gh IPC only trusts local/SSH repo registrations.
function getGitHubActionTarget(repo: Repo): RuntimeClientTarget {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  return host?.kind === 'runtime'
    ? { kind: 'environment', environmentId: host.environmentId }
    : { kind: 'local' }
}

export async function mergeGitHubHostedReview(args: {
  repo: Repo
  prNumber: number
  method: GitHubPRMergeMethod
  prRepo?: GitHubPRRepo | null
}): Promise<GitHubMutationResult> {
  const target = getGitHubActionTarget(args.repo)
  return callRuntimeOrpc(
    target,
    (client) => client.github.mergePR,
    {
      repo: args.repo.id,
      prNumber: args.prNumber,
      method: args.method,
      prRepo: args.prRepo ?? null
    },
    { timeoutMs: 30_000 }
  )
}

export async function setGitHubHostedReviewAutoMerge(args: {
  repo: Repo
  prNumber: number
  enabled: boolean
  method?: GitHubPRMergeMethod
  prRepo?: GitHubPRRepo | null
}): Promise<GitHubMutationResult> {
  const target = getGitHubActionTarget(args.repo)
  return callRuntimeOrpc(
    target,
    (client) => client.github.setPRAutoMerge,
    {
      repo: args.repo.id,
      prNumber: args.prNumber,
      enabled: args.enabled,
      method: args.method,
      prRepo: args.prRepo ?? null
    },
    { timeoutMs: 30_000 }
  )
}

export async function updateGitHubHostedReviewState(args: {
  repo: Repo
  prNumber: number
  nextState: 'open' | 'closed'
}): Promise<GitHubMutationResult> {
  const target = getGitHubActionTarget(args.repo)
  return callRuntimeOrpc(
    target,
    (client) => client.github.updatePRState,
    {
      repo: args.repo.id,
      prNumber: args.prNumber,
      updates: { state: args.nextState }
    },
    { timeoutMs: 30_000 }
  )
}
