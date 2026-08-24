import type {
  getPRChecks,
  getPRCheckDetails,
  rerunPRChecks,
  getPRComments,
  resolveReviewThread,
  setPRFileViewed,
  updatePRTitle,
  updatePRDetails
} from '~main/github/client'
import type { getPRFileContents } from '~main/github/work-item-details'
import type {
  closeMR as closeGitLabMR,
  getAuthenticatedViewer as getGitLabViewerClient,
  getJobTrace as getGitLabJobTrace,
  getMergeRequest as getGitLabMR,
  getMergeRequestForBranch as getGitLabMRForBranch,
  getProjectSlug as getGitLabProjectSlug,
  getWorkItemByProjectRef as getGitLabWorkItemByProjectRef,
  listAssignableUsers as listGitLabAssignableUsers,
  mergeMR as mergeGitLabMR,
  resolveMRDiscussion as resolveGitLabMRDiscussion,
  retryJob as retryGitLabJob,
  updateMR as updateGitLabMR,
  updateMRReviewers as updateGitLabMRReviewers
} from '~main/gitlab/client'
import type { getWorkItemDetails as getGitLabWorkItemDetails } from '~main/gitlab/work-item-details'
import type { GitHubOwnerRepo } from '~shared/types'
import type { GitHubPRFile, GitLabProjectRef } from '~shared/types'

import { RuntimeContractSearchRepoRefs } from './runtime-contract-search-repo-refs'

export abstract class RuntimeContractResolveGitLabRepoMRDiscussion extends RuntimeContractSearchRepoRefs {
  abstract resolveGitLabRepoMRDiscussion(
    repoSelector: string,
    iid: number,
    discussionId: string,
    resolved: boolean,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof resolveGitLabMRDiscussion>>>

  abstract getGitLabRepoJobTrace(
    repoSelector: string,
    jobId: number,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof getGitLabJobTrace>>>

  abstract retryGitLabRepoJob(
    repoSelector: string,
    jobId: number,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof retryGitLabJob>>>

  abstract mergeGitLabRepoMR(
    repoSelector: string,
    iid: number,
    method?: 'merge' | 'squash' | 'rebase',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof mergeGitLabMR>>>

  abstract updateGitLabRepoMRState(
    repoSelector: string,
    iid: number,
    state: 'opened' | 'closed',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof closeGitLabMR>>>

  abstract updateGitLabRepoMR(
    repoSelector: string,
    iid: number,
    updates: { title?: string; body?: string; addLabels?: string[]; removeLabels?: string[] },
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof updateGitLabMR>>>

  abstract updateGitLabRepoMRReviewers(
    repoSelector: string,
    iid: number,
    reviewerIds: number[],
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof updateGitLabMRReviewers>>>

  abstract getGitLabRepoWorkItemDetails(
    repoSelector: string,
    iid: number,
    type: 'mr',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof getGitLabWorkItemDetails>>>

  abstract getGitLabRepoWorkItemByPath(
    repoSelector: string,
    projectRef: GitLabProjectRef,
    iid: number,
    type: 'mr'
  ): Promise<Awaited<ReturnType<typeof getGitLabWorkItemByProjectRef>>>

  abstract getGitLabViewer(): Promise<Awaited<ReturnType<typeof getGitLabViewerClient>>>

  abstract getGitLabRepoProjectSlug(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof getGitLabProjectSlug>>>

  abstract getGitLabRepoMRForBranch(
    repoSelector: string,
    branch: string,
    linkedMRIid?: number | null
  ): Promise<Awaited<ReturnType<typeof getGitLabMRForBranch>>>

  abstract getGitLabRepoMR(
    repoSelector: string,
    iid: number
  ): Promise<Awaited<ReturnType<typeof getGitLabMR>>>

  abstract listGitLabRepoAssignableUsers(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listGitLabAssignableUsers>>>

  abstract getRepoPRChecks(
    repoSelector: string,
    prNumber: number,
    headSha?: string,
    prRepo?: GitHubOwnerRepo | null,
    options?: { noCache?: boolean; signal?: AbortSignal }
  ): Promise<Awaited<ReturnType<typeof getPRChecks>>>

  abstract rerunRepoPRChecks(
    repoSelector: string,
    prNumber: number,
    options?: { headSha?: string; failedOnly?: boolean }
  ): Promise<Awaited<ReturnType<typeof rerunPRChecks>>>

  abstract getRepoPRCheckDetails(
    repoSelector: string,
    args: {
      checkRunId?: number
      workflowRunId?: number
      checkName?: string
      url?: string | null
      prRepo?: GitHubOwnerRepo | null
    }
  ): Promise<Awaited<ReturnType<typeof getPRCheckDetails>>>

  abstract getRepoPRComments(
    repoSelector: string,
    prNumber: number,
    prRepo?: GitHubOwnerRepo | null,
    options?: { noCache?: boolean }
  ): Promise<Awaited<ReturnType<typeof getPRComments>>>

  abstract getRepoPRFileContents(
    repoSelector: string,
    args: {
      prNumber: number
      path: string
      oldPath?: string
      status: GitHubPRFile['status']
      headSha: string
      baseSha: string
    }
  ): Promise<Awaited<ReturnType<typeof getPRFileContents>>>

  abstract resolveRepoReviewThread(
    repoSelector: string,
    threadId: string,
    resolve: boolean
  ): Promise<Awaited<ReturnType<typeof resolveReviewThread>>>

  abstract setRepoPRFileViewed(
    repoSelector: string,
    args: {
      pullRequestId: string
      path: string
      viewed: boolean
    }
  ): Promise<Awaited<ReturnType<typeof setPRFileViewed>>>

  abstract updateRepoPRTitle(
    repoSelector: string,
    prNumber: number,
    title: string,
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof updatePRTitle>>>

  abstract updateRepoPRDetails(
    repoSelector: string,
    prNumber: number,
    updates: { title?: string; body?: string },
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof updatePRDetails>>>
}
