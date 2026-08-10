import type { GitHubPRMergeMethod } from '@yiru/workbench-model/review'

import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import { buildGithubPrParams, type GitHubPrRepoSlug } from './github-rpc'

// Mutation wrappers for the github.* PR surface, split out so github-pr-rpc.ts
// stays under the max-lines budget. They mirror the read wrappers' shape but
// return a host-status outcome (the host mutations all return
// `{ ok: true } | { ok: false; error: string }`).

export type GitHubPrMutationOutcome = { ok: true } | { ok: false; error: string }

// Sends a request whose host result is a bare boolean (not the `{ ok }` envelope),
// normalizing a transport throw into a failure so the raw-boolean callers below
// never see an unhandled rejection.
type RawResult<TResult> = { ok: true; result: TResult } | { ok: false; error: string }

async function readRawResult<TResult>(
  method: string,
  request: () => Promise<TResult>
): Promise<RawResult<TResult>> {
  try {
    return { ok: true, result: await request() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : `Request failed: ${method}` }
  }
}

// Host failures may expose either a bare string or an object `{ message }`.
// Preserve the specific message instead of replacing it with a generic fallback.
function extractMutationError(error: unknown, method: string): string {
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) {
      return message
    }
  }
  return `Request failed: ${method}`
}

// The host returns the success/failure shape inside `result`; a transport-level
// `response.ok === false` (timeout/connection) is also a failure. Both collapse
// into one outcome the action hook classifies via classifyPrSidebarFailure.
async function sendGithubPrMutation(
  method: string,
  request: () => Promise<{ ok: true } | { ok: false; error: string }>
): Promise<GitHubPrMutationOutcome> {
  try {
    const result = await request()
    if (result.ok) {
      return { ok: true }
    }
    return { ok: false, error: extractMutationError(result.error, method) }
  } catch (err) {
    // Why: a transport drop must not escape as an unhandled rejection — normalize
    // to the `{ ok:false, error }` outcome the action engine routes on.
    return { ok: false, error: err instanceof Error ? err.message : `Request failed: ${method}` }
  }
}

export async function fetchMergePR(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number; method?: GitHubPRMergeMethod; prRepo?: GitHubPrRepoSlug | null }
): Promise<GitHubPrMutationOutcome> {
  const params = {
    prNumber: args.prNumber,
    ...(args.method ? { method: args.method } : {})
  }
  return sendGithubPrMutation('github.mergePR', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.mergePR,
      buildGithubPrParams('github.mergePR', worktreeId, params, { prRepo: args.prRepo })
    )
  )
}

// Edit the hosted-review title. The host returns a bare boolean (true on success),
// which sendGithubPrMutation reads via its "no structured status" success branch
// only when not boolean — so handle the boolean explicitly like resolveReviewThread.
export async function fetchUpdatePRTitle(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number; title: string; prRepo?: GitHubPrRepoSlug | null }
): Promise<GitHubPrMutationOutcome> {
  const params = {
    prNumber: args.prNumber,
    title: args.title,
    ...(args.prRepo ? { prRepo: { owner: args.prRepo.owner, repo: args.prRepo.repo } } : {})
  }
  // updatePRTitle accepts prRepo for fork PRs, but it is not in the centralized
  // METHODS_ACCEPTING_PR_REPO read allow-list — pass it explicitly so it reaches the
  // host schema (which declares it optional/nullable).
  const response = await readRawResult('github.updatePRTitle', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.updatePRTitle,
      buildGithubPrParams('github.updatePRTitle', worktreeId, params)
    )
  )
  if (!response.ok) {
    return { ok: false, error: response.error || 'Request failed: github.updatePRTitle' }
  }
  // Why: the host returns a bare `true` on success; a missing/undefined result is
  // not a confirmed success, so require an explicit `=== true` rather than `!== false`.
  if (response.result !== true) {
    return { ok: false, error: 'Failed to update title.' }
  }
  return { ok: true }
}

export async function fetchSetPRAutoMerge(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: {
    prNumber: number
    enabled: boolean
    method?: GitHubPRMergeMethod
    prRepo?: GitHubPrRepoSlug | null
  }
): Promise<GitHubPrMutationOutcome> {
  const params = {
    prNumber: args.prNumber,
    enabled: args.enabled,
    ...(args.method ? { method: args.method } : {})
  }
  return sendGithubPrMutation('github.setPRAutoMerge', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.setPRAutoMerge,
      buildGithubPrParams('github.setPRAutoMerge', worktreeId, params, {
        prRepo: args.prRepo
      })
    )
  )
}

export async function fetchUpdatePRState(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number; state: 'open' | 'closed' }
): Promise<GitHubPrMutationOutcome> {
  // updatePRState does NOT accept prRepo (KTD3) — buildGithubPrParams omits it.
  return sendGithubPrMutation('github.updatePRState', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.updatePRState,
      buildGithubPrParams('github.updatePRState', worktreeId, {
        prNumber: args.prNumber,
        updates: { state: args.state }
      })
    )
  )
}

export async function fetchRequestPRReviewers(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number; reviewers: string[] }
): Promise<GitHubPrMutationOutcome> {
  // requestPRReviewers does NOT accept prRepo (KTD3).
  return sendGithubPrMutation('github.requestPRReviewers', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.requestPRReviewers,
      buildGithubPrParams('github.requestPRReviewers', worktreeId, {
        prNumber: args.prNumber,
        reviewers: args.reviewers
      })
    )
  )
}

export async function fetchRemovePRReviewers(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number; reviewers: string[] }
): Promise<GitHubPrMutationOutcome> {
  // removePRReviewers does NOT accept prRepo (KTD3).
  return sendGithubPrMutation('github.removePRReviewers', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.removePRReviewers,
      buildGithubPrParams('github.removePRReviewers', worktreeId, {
        prNumber: args.prNumber,
        reviewers: args.reviewers
      })
    )
  )
}

// Reply within a review thread. Host returns GitHubCommentResult
// (`{ ok, comment } | { ok:false, error }`), which sendGithubPrMutation reads via
// its `ok in result` branch. We refetch afterward, so the returned comment is unused.
export async function fetchAddPRReviewCommentReply(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: {
    prNumber: number
    commentId: number
    body: string
    threadId?: string
    path?: string
    line?: number
    prRepo?: GitHubPrRepoSlug | null
  }
): Promise<GitHubPrMutationOutcome> {
  const params = {
    prNumber: args.prNumber,
    commentId: args.commentId,
    body: args.body,
    ...(args.threadId ? { threadId: args.threadId } : {}),
    ...(args.path ? { path: args.path } : {}),
    ...(typeof args.line === 'number' ? { line: args.line } : {}),
    ...(args.prRepo ? { prRepo: { owner: args.prRepo.owner, repo: args.prRepo.repo } } : {})
  }
  // addPRReviewCommentReply accepts prRepo for fork PRs, but it is not in the
  // centralized METHODS_ACCEPTING_PR_REPO allow-list (read-focused) — pass it
  // explicitly so it reaches the host schema, which declares it optional.
  return sendGithubPrMutation('github.addPRReviewCommentReply', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.addPRReviewCommentReply,
      buildGithubPrParams('github.addPRReviewCommentReply', worktreeId, params)
    )
  )
}

// Add a root conversation comment to the PR. Host returns GitHubCommentResult.
export async function fetchAddPRComment(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number; body: string; prRepo?: GitHubPrRepoSlug | null }
): Promise<GitHubPrMutationOutcome> {
  const params = {
    number: args.prNumber,
    body: args.body,
    ...(args.prRepo ? { prRepo: { owner: args.prRepo.owner, repo: args.prRepo.repo } } : {})
  }
  return sendGithubPrMutation('github.addPRComment', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.addPRComment,
      buildGithubPrParams('github.addPRComment', worktreeId, params)
    )
  )
}

// Resolve/unresolve a review thread. `resolve` picks the direction (the host runs
// the matching GraphQL mutation). Unlike the comment mutations, the host returns a
// bare boolean, so a falsy result is a failure rather than the "no status" success.
export async function fetchResolveReviewThread(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { threadId: string; resolve: boolean }
): Promise<GitHubPrMutationOutcome> {
  const response = await readRawResult('github.resolveReviewThread', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.resolveReviewThread,
      buildGithubPrParams('github.resolveReviewThread', worktreeId, {
        threadId: args.threadId,
        resolve: args.resolve
      })
    )
  )
  if (!response.ok) {
    return {
      ok: false,
      error: response.error || 'Request failed: github.resolveReviewThread'
    }
  }
  // Why: the host returns a bare `true` on success; a missing/undefined result is
  // not a confirmed success, so require an explicit `=== true` rather than `!== false`.
  if (response.result !== true) {
    return { ok: false, error: 'Failed to update review thread.' }
  }
  return { ok: true }
}

export async function fetchRerunPRChecks(
  client: Pick<RpcClient, 'orpc'>,
  worktreeId: string,
  args: { prNumber: number; headSha?: string | null; failedOnly?: boolean }
): Promise<GitHubPrMutationOutcome> {
  // rerunPRChecks does NOT accept prRepo (KTD3); headSha is a plain param here.
  const params = {
    prNumber: args.prNumber,
    ...(args.failedOnly !== undefined ? { failedOnly: args.failedOnly } : {}),
    ...(args.headSha ? { headSha: args.headSha } : {})
  }
  return sendGithubPrMutation('github.rerunPRChecks', () =>
    callRuntimeOrpc(
      client,
      (runtime) => runtime.github.rerunPRChecks,
      buildGithubPrParams('github.rerunPRChecks', worktreeId, params)
    )
  )
}
