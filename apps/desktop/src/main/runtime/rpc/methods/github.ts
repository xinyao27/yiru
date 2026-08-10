import type {
  GitHubListWorkItemsInputSchema as WorkItemsList,
  GitHubPrForBranchInputSchema as PrForBranch,
  GitHubPullRequestCheckDetailsInputSchema as PullRequestCheckDetails,
  GitHubPullRequestChecksInputSchema as PullRequestChecks,
  GitHubPullRequestFileContentsInputSchema as PullRequestFileContents,
  GitHubPullRequestInputSchema as PullRequest,
  GitHubRateLimitInputSchema as RateLimit,
  GitHubRepoSelectorInputSchema as RepoSelector,
  GitHubWorkItemByOwnerRepoInputSchema as WorkItemByOwnerRepo,
  GitHubWorkItemInputSchema as WorkItem,
  GitHubWorkItemInputSchema as WorkItemDetails
} from '@yiru/runtime-protocol/contract'
import type { z } from 'zod'

import type { RpcContext } from '../core'

export const handleGitHubRepoSlug = (
  params: z.infer<typeof RepoSelector>,
  { runtime }: RpcContext
) => runtime.getRepoSlug(params.repo)

export const handleGitHubRepoUpstream = (
  params: z.infer<typeof RepoSelector>,
  { runtime }: RpcContext
) => runtime.getRepoUpstream(params.repo)

export const handleGitHubRateLimit = (params: z.infer<typeof RateLimit>, { runtime }: RpcContext) =>
  runtime.getGitHubRateLimit(params)

export const handleGitHubListWorkItems = (
  params: z.infer<typeof WorkItemsList>,
  { runtime }: RpcContext
) => runtime.listRepoWorkItems(params.repo, params.limit, params.query, params.page, params.noCache)

export const handleGitHubListLabels = (
  params: z.infer<typeof RepoSelector>,
  { runtime }: RpcContext
) => runtime.listRepoLabels(params.repo)

export const handleGitHubListAssignableUsers = (
  params: z.infer<typeof RepoSelector>,
  { runtime }: RpcContext
) => runtime.listRepoAssignableUsers(params.repo)

export const handleGitHubWorkItem = (params: z.infer<typeof WorkItem>, { runtime }: RpcContext) =>
  runtime.getRepoWorkItem(params.repo, params.number, params.type)

export const handleGitHubWorkItemByOwnerRepo = (
  params: z.infer<typeof WorkItemByOwnerRepo>,
  { runtime }: RpcContext
) =>
  runtime.getRepoWorkItemByOwnerRepo(
    params.repo,
    { owner: params.owner, repo: params.ownerRepo },
    params.number,
    params.type
  )

export const handleGitHubWorkItemDetails = (
  params: z.infer<typeof WorkItemDetails>,
  { runtime }: RpcContext
) => runtime.getRepoWorkItemDetails(params.repo, params.number, params.type)

export const handleGitHubPrForBranch = (
  params: z.infer<typeof PrForBranch>,
  { runtime }: RpcContext
) =>
  runtime.getRepoPRForBranch(
    params.repo,
    params.branch,
    params.linkedPRNumber,
    params.fallbackPRNumber,
    params.acceptMergedFallbackPR,
    params.currentHeadOid
  )

export const handleGitHubRefreshPRForBranch = (
  params: z.infer<typeof PrForBranch>,
  { runtime }: RpcContext
) =>
  runtime.getRepoPRForBranchOutcome(
    params.repo,
    params.branch,
    params.linkedPRNumber,
    params.fallbackPRNumber,
    params.acceptMergedFallbackPR,
    params.currentHeadOid
  )

export const handleGitHubPrChecks = (
  params: z.infer<typeof PullRequestChecks>,
  { runtime }: RpcContext
) =>
  runtime.getRepoPRChecks(params.repo, params.prNumber, params.headSha, params.prRepo ?? null, {
    noCache: params.noCache
  })

export const handleGitHubPrCheckDetails = (
  params: z.infer<typeof PullRequestCheckDetails>,
  { runtime }: RpcContext
) =>
  runtime.getRepoPRCheckDetails(params.repo, {
    checkRunId: params.checkRunId,
    workflowRunId: params.workflowRunId,
    checkName: params.checkName,
    url: params.url,
    prRepo: params.prRepo ?? null
  })

export const handleGitHubPrComments = (
  params: z.infer<typeof PullRequest>,
  { runtime }: RpcContext
) =>
  runtime.getRepoPRComments(params.repo, params.prNumber, params.prRepo ?? null, {
    noCache: params.noCache
  })

export const handleGitHubPrFileContents = (
  params: z.infer<typeof PullRequestFileContents>,
  { runtime }: RpcContext
) =>
  runtime.getRepoPRFileContents(params.repo, {
    prNumber: params.prNumber,
    path: params.path,
    oldPath: params.oldPath,
    status: params.status,
    headSha: params.headSha,
    baseSha: params.baseSha
  })
