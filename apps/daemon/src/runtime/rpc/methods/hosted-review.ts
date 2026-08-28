import type {
  HostedReviewCreateInput,
  HostedReviewCreationEligibilityInput,
  HostedReviewForBranchInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export async function handleHostedReviewForBranch(
  params: HostedReviewForBranchInput,
  { runtime }: RpcContext
) {
  const fallbackGitHubPR = params.linkedGitHubPR == null ? (params.fallbackGitHubPR ?? null) : null
  return runtime.getHostedReviewForBranch({
    repoSelector: params.repo,
    branch: params.branch,
    currentHeadOid: params.currentHeadOid ?? null,
    linkedGitHubPR: params.linkedGitHubPR ?? null,
    ...(fallbackGitHubPR !== null ? { fallbackGitHubPR } : {}),
    linkedGitLabMR: params.linkedGitLabMR ?? null,
    linkedBitbucketPR: params.linkedBitbucketPR ?? null,
    linkedAzureDevOpsPR: params.linkedAzureDevOpsPR ?? null,
    linkedGiteaPR: params.linkedGiteaPR ?? null
  })
}

export async function handleHostedReviewGetCreationEligibility(
  params: HostedReviewCreationEligibilityInput,
  { runtime }: RpcContext
) {
  const fallbackGitHubPR = params.linkedGitHubPR == null ? (params.fallbackGitHubPR ?? null) : null
  return runtime.getHostedReviewCreationEligibility({
    repoSelector: params.repo,
    worktreeSelector: params.worktree,
    branch: params.branch,
    base: params.base ?? null,
    hasUncommittedChanges: params.hasUncommittedChanges,
    hasUpstream: params.hasUpstream,
    ahead: params.ahead,
    behind: params.behind,
    linkedGitHubPR: params.linkedGitHubPR ?? null,
    ...(fallbackGitHubPR !== null ? { fallbackGitHubPR } : {}),
    linkedGitLabMR: params.linkedGitLabMR ?? null,
    linkedBitbucketPR: params.linkedBitbucketPR ?? null,
    linkedAzureDevOpsPR: params.linkedAzureDevOpsPR ?? null,
    linkedGiteaPR: params.linkedGiteaPR ?? null
  })
}

export async function handleHostedReviewCreate(
  params: HostedReviewCreateInput,
  { runtime }: RpcContext
) {
  return runtime.createHostedReview({
    repoSelector: params.repo,
    worktreeSelector: params.worktree,
    provider: params.provider,
    base: params.base,
    head: params.head,
    title: params.title,
    body: params.body,
    draft: params.draft,
    useTemplate: params.useTemplate
  })
}
