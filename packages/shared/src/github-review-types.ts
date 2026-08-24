import type * as WorkbenchReviewTypes from '@yiru/workbench-model/review'

export type PRState = WorkbenchReviewTypes.PRState
export type CheckStatus = WorkbenchReviewTypes.CheckStatus
export type PRMergeableState = WorkbenchReviewTypes.PRMergeableState
export type PRReviewDecision = WorkbenchReviewTypes.PRReviewDecision
export type PRConflictSummary = WorkbenchReviewTypes.PRConflictSummary
export type GitHubRepositoryIdentity = WorkbenchReviewTypes.GitHubRepositoryIdentity
export type GitHubPRMergeMethod = WorkbenchReviewTypes.GitHubPRMergeMethod
export type GitHubPRMergeMethodSettings = WorkbenchReviewTypes.GitHubPRMergeMethodSettings
export type PRInfo = WorkbenchReviewTypes.PRInfo
export type PRRefreshOutcome = WorkbenchReviewTypes.PRRefreshOutcome
export type GitHubPRRefreshReason = WorkbenchReviewTypes.GitHubPRRefreshReason
export type GitHubPRRefreshEnqueueResult = WorkbenchReviewTypes.GitHubPRRefreshEnqueueResult
export type GitHubPRRefreshAlias = WorkbenchReviewTypes.GitHubPRRefreshAlias
export type GitHubPRRefreshCandidate = WorkbenchReviewTypes.GitHubPRRefreshCandidate
export type GitHubPRRefreshSkippedReason = WorkbenchReviewTypes.GitHubPRRefreshSkippedReason
export type GitHubPRRefreshEvent = WorkbenchReviewTypes.GitHubPRRefreshEvent
export type PRCheckDetail = WorkbenchReviewTypes.PRCheckDetail
export type PRCheckAnnotation = WorkbenchReviewTypes.PRCheckAnnotation
export type PRCheckStep = WorkbenchReviewTypes.PRCheckStep
export type PRCheckJob = WorkbenchReviewTypes.PRCheckJob
export type PRCheckRunDetails = WorkbenchReviewTypes.PRCheckRunDetails
export type GitHubRerunPRChecksResult = WorkbenchReviewTypes.GitHubRerunPRChecksResult
export type GitHubReactionContent = WorkbenchReviewTypes.GitHubReactionContent
export type GitHubReaction = WorkbenchReviewTypes.GitHubReaction
export type PRComment = WorkbenchReviewTypes.PRComment
export type GitHubCommentResult = WorkbenchReviewTypes.GitHubCommentResult
export type GitHubViewer = WorkbenchReviewTypes.GitHubViewer
export type GitHubAssignableUser = WorkbenchReviewTypes.GitHubAssignableUser
export type GitHubPRCheckSummary = WorkbenchReviewTypes.GitHubPRCheckSummary
export type GitHubPRReviewSummary = WorkbenchReviewTypes.GitHubPRReviewSummary
export type GitHubPRFileViewedState = WorkbenchReviewTypes.GitHubPRFileViewedState
export type GitHubWorkItem = WorkbenchReviewTypes.GitHubWorkItem
export type GitHubPRFile = WorkbenchReviewTypes.GitHubPRFile
export type GitHubPRFileContents = WorkbenchReviewTypes.GitHubPRFileContents
export type GitHubPRReviewCommentInput = WorkbenchReviewTypes.GitHubPRReviewCommentInput
export type GitHubWorkItemDetails = WorkbenchReviewTypes.GitHubWorkItemDetails
export type GitHubPullRequestStateUpdate = WorkbenchReviewTypes.GitHubPullRequestStateUpdate
export type ClassifiedError = WorkbenchReviewTypes.ClassifiedError
export type GitHubOwnerRepo = WorkbenchReviewTypes.GitHubOwnerRepo

export type GitHubRateLimitBucket = {
  remaining: number
  limit: number
  /** Unix epoch seconds when the window resets. */
  resetAt: number
}

export type GitHubRateLimitSnapshot = {
  core: GitHubRateLimitBucket
  search: GitHubRateLimitBucket
  graphql: GitHubRateLimitBucket
  /** Unix epoch ms the snapshot was produced (for "fetched Xs ago" copy). */
  fetchedAt: number
}

export type GetRateLimitResult =
  | { ok: true; snapshot: GitHubRateLimitSnapshot }
  | { ok: false; error: string }

export type ListWorkItemsResult<T> = {
  items: T[]
  source: GitHubOwnerRepo | null
}
