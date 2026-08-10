import type { HostedReviewInfo } from '@yiru/workbench-model/review'
import type {
  GitHubAssignableUser,
  GitHubWorkItemDetails,
  PRCheckDetail,
  PRCheckRunDetails,
  PRInfo
} from '@yiru/workbench-model/review'

import { mobileRepoSelectorFromWorktreeId } from '~/source-control/pr-create'
import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import {
  readAssignableUsers,
  readForBranch,
  readPRCheckDetails,
  readPRChecks,
  readPRForBranch,
  readWorkItemDetails
} from './github-parsers'

// Re-export the defensive parsers so consumers (and tests) have a single entry
// point for the github.* PR RPC surface.
export {
  readAssignableUsers,
  readForBranch,
  readPRCheckDetails,
  readPRChecks,
  readPRForBranch,
  readWorkItemDetails
} from './github-parsers'

// Why: a fork PR's head lives in a different owner/repo; the host's SlugRepo
// (`{ owner, repo }`) identifies it. Only a subset of github.* methods accept it.
export type GitHubPrRepoSlug = { owner: string; repo: string }

export type GitHubPrReadOutcome<T> = { ok: true; result: T } | { ok: false; error: string }

// Why: `prRepo` is method-asymmetric (KTD3). These are the only github.* methods
// whose host schema (SlugRepo on PullRequest/PullRequestChecks/PullRequestCheckDetails)
// accepts it; the rest reject the key. Centralizing the allow-list keeps a fork's
// prRepo from leaking into a schema that would reject it.
const METHODS_ACCEPTING_PR_REPO = new Set<string>([
  'github.prChecks',
  'github.prCheckDetails',
  'github.mergePR',
  'github.setPRAutoMerge',
  'github.prComments'
])

// Why: only github.prChecks declares a `headSha` param (PullRequestCheckDetails
// does not), so headSha is forwarded just to that read. Check runs are commit-keyed.
const METHODS_ACCEPTING_HEAD_SHA = new Set<string>(['github.prChecks'])

export function buildGithubPrParams<TParams extends object>(
  method: string,
  worktreeId: string,
  params: TParams,
  options?: { prRepo?: GitHubPrRepoSlug | null; headSha?: string | null }
) {
  const prRepo = options?.prRepo && METHODS_ACCEPTING_PR_REPO.has(method) ? options.prRepo : null
  const headSha =
    options?.headSha && METHODS_ACCEPTING_HEAD_SHA.has(method) ? options.headSha : null
  return {
    repo: mobileRepoSelectorFromWorktreeId(worktreeId),
    ...params,
    ...(prRepo && !('prRepo' in params)
      ? { prRepo: { owner: prRepo.owner, repo: prRepo.repo } }
      : {}),
    ...(headSha && !('headSha' in params) ? { headSha } : {})
  }
}

async function readGithubPrRequest<TOutput, TResult>(
  method: string,
  request: () => Promise<TOutput>,
  parse: (value: TOutput) => TResult
): Promise<GitHubPrReadOutcome<TResult>> {
  try {
    return { ok: true, result: parse(await request()) }
  } catch (err) {
    // Why: a transport drop or a parser throw must not escape as an unhandled
    // rejection — normalize to the `{ ok:false, error }` contract callers expect.
    return { ok: false, error: err instanceof Error ? err.message : `Request failed: ${method}` }
  }
}

// Probes whether the worktree's repo has a GitHub remote (a non-null slug). Used
// to decide whether the dedicated PR-view icon is available — independent of
// whether the branch has an open PR.
export async function fetchGithubRepoSlug(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string
): Promise<GitHubPrReadOutcome<GitHubPrRepoSlug | null>> {
  return readGithubPrRequest(
    'github.repoSlug',
    () =>
      callRuntimeOrpc(
        client,
        (runtime) => runtime.github.repoSlug,
        buildGithubPrParams('github.repoSlug', worktreeId, {})
      ),
    (value) => {
      if (!value || typeof value !== 'object') {
        return null
      }
      const record = value as Record<string, unknown>
      const owner = record.owner
      const repo = record.repo
      return typeof owner === 'string' && typeof repo === 'string' ? { owner, repo } : null
    }
  )
}

export async function fetchHostedReviewForBranch(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { branch: string; linkedGitHubPR?: number | null }
): Promise<GitHubPrReadOutcome<HostedReviewInfo | null>> {
  return readGithubPrRequest(
    'hostedReview.forBranch',
    () =>
      callRuntimeOrpc(client, (runtime) => runtime.hostedReview.forBranch, {
        repo: mobileRepoSelectorFromWorktreeId(worktreeId),
        branch: args.branch,
        linkedGitHubPR: args.linkedGitHubPR ?? null
      }),
    readForBranch
  )
}

export async function fetchPRForBranch(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { branch: string; linkedPRNumber?: number | null }
): Promise<GitHubPrReadOutcome<PRInfo | null>> {
  return readGithubPrRequest(
    'github.prForBranch',
    () =>
      callRuntimeOrpc(
        client,
        (runtime) => runtime.github.prForBranch,
        buildGithubPrParams('github.prForBranch', worktreeId, {
          branch: args.branch,
          linkedPRNumber: args.linkedPRNumber ?? null
        })
      ),
    readPRForBranch
  )
}

export async function fetchWorkItemDetails(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number }
): Promise<GitHubPrReadOutcome<GitHubWorkItemDetails | null>> {
  return readGithubPrRequest(
    'github.workItemDetails',
    () =>
      callRuntimeOrpc(
        client,
        (runtime) => runtime.github.workItemDetails,
        buildGithubPrParams('github.workItemDetails', worktreeId, {
          number: args.prNumber,
          type: 'pr' as const
        })
      ),
    readWorkItemDetails
  )
}

export async function fetchPRChecks(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number; headSha?: string | null; prRepo?: GitHubPrRepoSlug | null }
): Promise<GitHubPrReadOutcome<PRCheckDetail[]>> {
  return readGithubPrRequest(
    'github.prChecks',
    () =>
      callRuntimeOrpc(
        client,
        (runtime) => runtime.github.prChecks,
        buildGithubPrParams(
          'github.prChecks',
          worktreeId,
          { prNumber: args.prNumber },
          { prRepo: args.prRepo, headSha: args.headSha }
        )
      ),
    readPRChecks
  )
}

export async function fetchPRCheckDetails(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: {
    checkRunId?: number
    workflowRunId?: number
    checkName?: string
    url?: string | null
    prRepo?: GitHubPrRepoSlug | null
  }
): Promise<GitHubPrReadOutcome<PRCheckRunDetails | null>> {
  const params = {
    ...(args.checkRunId !== undefined ? { checkRunId: args.checkRunId } : {}),
    ...(args.workflowRunId !== undefined ? { workflowRunId: args.workflowRunId } : {}),
    ...(args.checkName !== undefined ? { checkName: args.checkName } : {}),
    ...(args.url !== undefined ? { url: args.url } : {})
  }
  return readGithubPrRequest(
    'github.prCheckDetails',
    () =>
      callRuntimeOrpc(
        client,
        (runtime) => runtime.github.prCheckDetails,
        buildGithubPrParams('github.prCheckDetails', worktreeId, params, {
          prRepo: args.prRepo
        })
      ),
    readPRCheckDetails
  )
}

export async function fetchAssignableUsers(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string
): Promise<GitHubPrReadOutcome<GitHubAssignableUser[]>> {
  return readGithubPrRequest(
    'github.listAssignableUsers',
    () =>
      callRuntimeOrpc(
        client,
        (runtime) => runtime.github.listAssignableUsers,
        buildGithubPrParams('github.listAssignableUsers', worktreeId, {})
      ),
    readAssignableUsers
  )
}
