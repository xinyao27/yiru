import type {
  GitHubMergePrInputSchema as MergePr,
  GitHubPrReviewCommentInputSchema as PRReviewComment,
  GitHubPrReviewCommentReplyInputSchema as PRReviewCommentReply,
  GitHubPullRequestCommentInputSchema as PullRequestComment,
  GitHubPullRequestFileViewedInputSchema as PullRequestFileViewed,
  GitHubRequestPrReviewersInputSchema as RemovePrReviewers,
  GitHubRequestPrReviewersInputSchema as RequestPrReviewers,
  GitHubRerunPullRequestChecksInputSchema as RerunPullRequestChecks,
  GitHubReviewThreadInputSchema as ReviewThread,
  GitHubSetPrAutoMergeInputSchema as SetPrAutoMerge,
  GitHubUpdatePrInputSchema as UpdatePr,
  GitHubUpdatePrStateInputSchema as UpdatePrState,
  GitHubUpdatePrTitleInputSchema as UpdatePrTitle
} from '@yiru/runtime-protocol/contract'
import type { z } from 'zod'

import type { RpcContext } from '../core'

// Why: split out of github.ts to stay under the 300-line ceiling. The seam is
// real — these are the calls that mutate state on GitHub under the owner's
// identity, unlike the read half.
export const handleGitHubRerunPRChecks = (
  params: z.infer<typeof RerunPullRequestChecks>,
  { runtime }: RpcContext
) =>
  runtime.rerunRepoPRChecks(params.repo, params.prNumber, {
    headSha: params.headSha,
    failedOnly: params.failedOnly
  })

export const handleGitHubResolveReviewThread = (
  params: z.infer<typeof ReviewThread>,
  { runtime }: RpcContext
) => runtime.resolveRepoReviewThread(params.repo, params.threadId, params.resolve)

export const handleGitHubSetPRFileViewed = (
  params: z.infer<typeof PullRequestFileViewed>,
  { runtime }: RpcContext
) =>
  runtime.setRepoPRFileViewed(params.repo, {
    pullRequestId: params.pullRequestId,
    path: params.path,
    viewed: params.viewed
  })

export const handleGitHubUpdatePRTitle = (
  params: z.infer<typeof UpdatePrTitle>,
  { runtime }: RpcContext
) => runtime.updateRepoPRTitle(params.repo, params.prNumber, params.title, params.prRepo ?? null)

export const handleGitHubUpdatePR = (params: z.infer<typeof UpdatePr>, { runtime }: RpcContext) =>
  runtime.updateRepoPRDetails(params.repo, params.prNumber, params.updates, params.prRepo ?? null)

export const handleGitHubMergePR = (params: z.infer<typeof MergePr>, { runtime }: RpcContext) =>
  runtime.mergeRepoPR(params.repo, params.prNumber, params.method, params.prRepo ?? null)

export const handleGitHubSetPRAutoMerge = (
  params: z.infer<typeof SetPrAutoMerge>,
  { runtime }: RpcContext
) =>
  runtime.setRepoPRAutoMerge(
    params.repo,
    params.prNumber,
    params.enabled,
    params.method,
    params.prRepo ?? null
  )

export const handleGitHubUpdatePRState = (
  params: z.infer<typeof UpdatePrState>,
  { runtime }: RpcContext
) => runtime.updateRepoPRState(params.repo, params.prNumber, params.updates)

export const handleGitHubRequestPRReviewers = (
  params: z.infer<typeof RequestPrReviewers>,
  { runtime }: RpcContext
) => runtime.requestRepoPRReviewers(params.repo, params.prNumber, params.reviewers)

export const handleGitHubRemovePRReviewers = (
  params: z.infer<typeof RemovePrReviewers>,
  { runtime }: RpcContext
) => runtime.removeRepoPRReviewers(params.repo, params.prNumber, params.reviewers)

export const handleGitHubAddPRComment = (
  params: z.infer<typeof PullRequestComment>,
  { runtime }: RpcContext
) => runtime.addRepoPRComment(params.repo, params.number, params.body, params.prRepo ?? null)

export const handleGitHubAddPRReviewComment = (
  params: z.infer<typeof PRReviewComment>,
  { runtime }: RpcContext
) =>
  runtime.addRepoPRReviewComment(params.repo, {
    prNumber: params.prNumber,
    commitId: params.commitId,
    path: params.path,
    line: params.line,
    startLine: params.startLine,
    body: params.body
  })

export const handleGitHubAddPRReviewCommentReply = (
  params: z.infer<typeof PRReviewCommentReply>,
  { runtime }: RpcContext
) =>
  runtime.addRepoPRReviewCommentReply(params.repo, {
    prNumber: params.prNumber,
    commentId: params.commentId,
    body: params.body,
    threadId: params.threadId,
    path: params.path,
    line: params.line,
    prRepo: params.prRepo ?? null
  })
