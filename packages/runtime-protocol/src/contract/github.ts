import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import type {
  GitHubAssignableUser,
  GitHubPRRefreshEvent,
  GitHubCommentResult,
  GitHubOwnerRepo,
  GitHubPRFileContents,
  GitHubRerunPRChecksResult,
  GitHubWorkItem,
  GitHubWorkItemDetails,
  PRCheckDetail,
  PRCheckRunDetails,
  PRComment,
  PRInfo,
  PRRefreshOutcome
} from '@yiru/workbench-model/review'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  GitHubListWorkItemsInputSchema,
  GitHubMergePrInputSchema,
  GitHubPrForBranchInputSchema,
  GitHubPrReviewCommentInputSchema,
  GitHubPrReviewCommentReplyInputSchema,
  GitHubPullRequestCheckDetailsInputSchema,
  GitHubPullRequestChecksInputSchema,
  GitHubPullRequestCommentInputSchema,
  GitHubPullRequestFileContentsInputSchema,
  GitHubPullRequestFileViewedInputSchema,
  GitHubPullRequestInputSchema,
  GitHubRateLimitInputSchema,
  GitHubRepoSelectorInputSchema,
  GitHubRequestPrReviewersInputSchema,
  GitHubRerunPullRequestChecksInputSchema,
  GitHubReviewThreadInputSchema,
  GitHubSetPrAutoMergeInputSchema,
  GitHubUpdatePrInputSchema,
  GitHubUpdatePrStateInputSchema,
  GitHubUpdatePrTitleInputSchema,
  GitHubWorkItemByOwnerRepoInputSchema,
  GitHubWorkItemInputSchema
} from './github-inputs.js'

export type GitHubRuntimeWorkItem = Omit<GitHubWorkItem, 'repoId'>

export type GitHubListWorkItemsResult = {
  items: GitHubRuntimeWorkItem[]
  source: GitHubOwnerRepo | null
}

export type GitHubRateLimitBucket = {
  remaining: number
  limit: number
  resetAt: number
}

export type GitHubRateLimitSnapshot = {
  core: GitHubRateLimitBucket
  search: GitHubRateLimitBucket
  graphql: GitHubRateLimitBucket
  fetchedAt: number
}

export type GitHubRateLimitResult =
  | { ok: true; snapshot: GitHubRateLimitSnapshot }
  | { ok: false; error: string }

export type GitHubMutationResult = { ok: true } | { ok: false; error: string }

const GITHUB_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const GITHUB_HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const GITHUB_WRITE_ACCESS = { scope: 'project', tier: 'host' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const githubContract = {
  repoSlug: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubRepoSelectorInputSchema)
    .output(type<GitHubOwnerRepo | null>()),
  repoUpstream: withAccess(GITHUB_READ_ACCESS)
    .input(GitHubRepoSelectorInputSchema)
    .output(type<GitHubOwnerRepo | null>()),
  rateLimit: withAccess(GITHUB_HOST_READ_ACCESS)
    .input(GitHubRateLimitInputSchema)
    .output(type<GitHubRateLimitResult>()),
  listWorkItems: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubListWorkItemsInputSchema)
    .output(type<GitHubListWorkItemsResult>()),
  listLabels: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubRepoSelectorInputSchema)
    .output(type<string[]>()),
  listAssignableUsers: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubRepoSelectorInputSchema)
    .output(type<GitHubAssignableUser[]>()),
  workItem: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubWorkItemInputSchema)
    .output(type<GitHubRuntimeWorkItem | null>()),
  workItemByOwnerRepo: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubWorkItemByOwnerRepoInputSchema)
    .output(type<GitHubRuntimeWorkItem | null>()),
  workItemDetails: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubWorkItemInputSchema)
    .output(type<GitHubWorkItemDetails | null>()),
  prForBranch: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubPrForBranchInputSchema)
    .output(type<PRInfo | null>()),
  refreshPRForBranch: withAccess(GITHUB_READ_ACCESS)
    .input(GitHubPrForBranchInputSchema)
    .output(type<PRRefreshOutcome>()),
  prChecks: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubPullRequestChecksInputSchema)
    .output(type<PRCheckDetail[]>()),
  prCheckDetails: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubPullRequestCheckDetailsInputSchema)
    .output(type<PRCheckRunDetails | null>()),
  prComments: withAccess(GITHUB_READ_ACCESS)
    .input(GitHubPullRequestInputSchema)
    .output(type<PRComment[]>()),
  prFileContents: withAccess(GITHUB_READ_ACCESS, MOBILE_CLIENT)
    .input(GitHubPullRequestFileContentsInputSchema)
    .output(type<GitHubPRFileContents>()),
  rerunPRChecks: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubRerunPullRequestChecksInputSchema)
    .output(type<GitHubRerunPRChecksResult>()),
  resolveReviewThread: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubReviewThreadInputSchema)
    .output(type<boolean>()),
  setPRFileViewed: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubPullRequestFileViewedInputSchema)
    .output(type<boolean>()),
  updatePRTitle: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubUpdatePrTitleInputSchema)
    .output(type<boolean>()),
  updatePR: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubUpdatePrInputSchema)
    .output(type<GitHubMutationResult>()),
  mergePR: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubMergePrInputSchema)
    .output(type<GitHubMutationResult>()),
  setPRAutoMerge: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubSetPrAutoMergeInputSchema)
    .output(type<GitHubMutationResult>()),
  updatePRState: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubUpdatePrStateInputSchema)
    .output(type<GitHubMutationResult>()),
  requestPRReviewers: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubRequestPrReviewersInputSchema)
    .output(type<GitHubMutationResult>()),
  removePRReviewers: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubRequestPrReviewersInputSchema)
    .output(type<GitHubMutationResult>()),
  addPRComment: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubPullRequestCommentInputSchema)
    .output(type<GitHubCommentResult>()),
  addPRReviewComment: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubPrReviewCommentInputSchema)
    .output(type<GitHubCommentResult>()),
  addPRReviewCommentReply: withAccess(GITHUB_WRITE_ACCESS, MOBILE_CLIENT)
    .input(GitHubPrReviewCommentReplyInputSchema)
    .output(type<GitHubCommentResult>()),
  // Why: PR refresh ticks and work-item mutations are host-side review state;
  // the shell gets them over IPC and paired clients render the same panels.
  // Host scope, not project: the coordinator broadcasts across every tracked
  // repo, so a project-scoped grant would leak other projects' review activity.
  events: {
    subscribe: withAccess({ scope: 'host', tier: 'read' }, MOBILE_CLIENT)
      .input(type<void>())
      .output(eventIterator(type<RuntimeGitHubSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  GitHubListWorkItemsInputSchema,
  GitHubMergePrInputSchema,
  GitHubPrForBranchInputSchema,
  GitHubPrReviewCommentInputSchema,
  GitHubPrReviewCommentReplyInputSchema,
  GitHubPullRequestCheckDetailsInputSchema,
  GitHubPullRequestChecksInputSchema,
  GitHubPullRequestCommentInputSchema,
  GitHubPullRequestFileContentsInputSchema,
  GitHubPullRequestFileViewedInputSchema,
  GitHubPullRequestInputSchema,
  GitHubRateLimitInputSchema,
  GitHubRepoSelectorInputSchema,
  GitHubRequestPrReviewersInputSchema,
  GitHubRerunPullRequestChecksInputSchema,
  GitHubReviewThreadInputSchema,
  GitHubSetPrAutoMergeInputSchema,
  GitHubSlugRepoInputSchema,
  GitHubUpdatePrInputSchema,
  GitHubUpdatePrStateInputSchema,
  GitHubUpdatePrTitleInputSchema,
  GitHubWorkItemByOwnerRepoInputSchema,
  GitHubWorkItemInputSchema
} from './github-inputs.js'

export type RuntimeGitHubWorkItemMutatedEvent = {
  repoPath: string
  repoId?: string
  type: 'pr'
  number: number
}

// Why: the work-item payload carries its own `type: 'pr'` discriminant, so the
// envelope nests it rather than spreading — a spread would collide.
export type RuntimeGitHubEvent =
  | { type: 'prRefresh'; event: GitHubPRRefreshEvent }
  | { type: 'workItemMutated'; item: RuntimeGitHubWorkItemMutatedEvent }

export type RuntimeGitHubSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeGitHubEvent
  | { type: 'end' }
