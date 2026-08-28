import type { GitLabMutationResult } from '@yiru/runtime-protocol/contract'
import {
  getRepoExecutionHostId,
  parseExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import type { Repo } from '@yiru/runtime-protocol/workbench/types'
import { callRuntimeOrpc, type RuntimeClientTarget } from '~renderer/runtime/orpc-client'

// Why: runtime-host projects mirror server paths into the desktop store, but
// desktop gitlab IPC only trusts local/SSH repo registrations.
function getGitLabActionTarget(repo: Repo): RuntimeClientTarget {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  return host?.kind === 'runtime'
    ? { kind: 'environment', environmentId: host.environmentId }
    : { kind: 'local' }
}

export async function mergeGitLabHostedReview(args: {
  repo: Repo
  iid: number
  method?: 'merge' | 'squash' | 'rebase'
}): Promise<GitLabMutationResult> {
  const target = getGitLabActionTarget(args.repo)
  return callRuntimeOrpc(
    target,
    (client) => client.gitlab.mergeMR,
    {
      repo: args.repo.id,
      iid: args.iid,
      method: args.method
    },
    { timeoutMs: 30_000 }
  )
}

export async function updateGitLabHostedReviewState(args: {
  repo: Repo
  iid: number
  nextState: 'opened' | 'closed'
}): Promise<GitLabMutationResult> {
  const target = getGitLabActionTarget(args.repo)
  return callRuntimeOrpc(
    target,
    (client) => client.gitlab.updateMRState,
    {
      repo: args.repo.id,
      iid: args.iid,
      state: args.nextState
    },
    { timeoutMs: 30_000 }
  )
}
