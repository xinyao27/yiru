import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult,
  HostedReviewCreationEligibility,
  HostedReviewCreationEligibilityArgs,
  HostedReviewInfo,
  PRRefreshOutcome
} from '@yiru/workbench-model/review'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type {
  getPRForBranch,
  getWorkItem,
  getWorkItemByOwnerRepo,
  listPullRequestLabels,
  listPullRequestAssignableUsers,
  MainWorkItem
} from '~main/github/client'
import type { getRateLimit } from '~main/github/rate-limit'
import type { getWorkItemDetails } from '~main/github/work-item-details'
import type {
  diagnoseAuth as diagnoseGitLabAuthClient,
  getRateLimit as getGitLabRateLimit,
  addMRInlineComment as addGitLabMRInlineComment,
  addMRComment as addGitLabMRComment,
  listLabels as listGitLabLabels,
  listMergeRequests as listGitLabMergeRequests
} from '~main/gitlab/client'
import type { RuntimeRepoSearchRefs } from '~shared/runtime-types'
import type { Repo } from '~shared/types'
import type {
  GitLabMRInlineCommentInput,
  GitLabProjectRef,
  ListWorkItemsResult,
  MRListState
} from '~shared/types'

import type { TerminalWorkspaceLaunchScope } from '../model/worktree-resolution'
import { RuntimeContractUpdateFolderWorkspace } from './runtime-contract-update-folder-workspace'

export abstract class RuntimeContractSearchRepoRefs extends RuntimeContractUpdateFolderWorkspace {
  abstract searchRepoRefs(
    repoSelector: string,
    query: string,
    limit?: number,
    hostId?: ExecutionHostId
  ): Promise<RuntimeRepoSearchRefs>

  abstract getRepoBaseRefDefault(
    repoSelector: string,
    hostId?: ExecutionHostId
  ): Promise<{ defaultBaseRef: string | null; remoteCount: number }>

  protected abstract resolveHostedReviewTarget(args: {
    repoSelector: string
    worktreeSelector?: string
  }): Promise<{ repo: Repo; repoPath: string }>

  protected abstract getHostedReviewExecutionOptions(
    repo: Repo
  ): { localGitExecOptions: { wslDistro?: string } } | undefined

  protected abstract getLocalGitExecutionOptionArgs(repo: Repo): [] | [{ wslDistro?: string }]

  protected abstract getAgentLaunchPlatformForRepo(repo: Repo): NodeJS.Platform

  protected abstract getAgentLaunchPlatformForWorkspace(
    scope: TerminalWorkspaceLaunchScope
  ): NodeJS.Platform

  abstract getRepoSlug(repoSelector: string): Promise<{ owner: string; repo: string } | null>

  abstract getRepoUpstream(repoSelector: string): Promise<{ owner: string; repo: string } | null>

  abstract getGitLabRepoProjectRef(repoSelector: string): Promise<GitLabProjectRef | null>

  protected abstract backfillForkUpstreams(): Promise<void>

  abstract listRepoWorkItems(
    repoSelector: string,
    limit?: number,
    query?: string,
    page?: number,
    noCache?: boolean
  ): Promise<ListWorkItemsResult<MainWorkItem>>

  abstract getRepoWorkItem(
    repoSelector: string,
    number: number,
    type?: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItem>>>

  abstract getRepoWorkItemByOwnerRepo(
    repoSelector: string,
    ownerRepo: { owner: string; repo: string },
    number: number,
    type: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItemByOwnerRepo>>>

  abstract getRepoWorkItemDetails(
    repoSelector: string,
    number: number,
    type?: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItemDetails>>>

  abstract listRepoLabels(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listPullRequestLabels>>>

  abstract listRepoAssignableUsers(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listPullRequestAssignableUsers>>>

  abstract getGitHubRateLimit(options?: {
    force?: boolean
  }): Promise<Awaited<ReturnType<typeof getRateLimit>>>

  abstract getRepoPRForBranch(
    repoSelector: string,
    branch: string,
    linkedPRNumber?: number | null,
    fallbackPRNumber?: number | null,
    acceptMergedFallbackPR?: boolean,
    currentHeadOid?: string | null
  ): Promise<Awaited<ReturnType<typeof getPRForBranch>>>

  abstract getRepoPRForBranchOutcome(
    repoSelector: string,
    branch: string,
    linkedPRNumber?: number | null,
    fallbackPRNumber?: number | null,
    acceptMergedFallbackPR?: boolean,
    currentHeadOid?: string | null
  ): Promise<PRRefreshOutcome>

  abstract getHostedReviewForBranch(args: {
    repoSelector: string
    branch: string
    currentHeadOid?: string | null
    linkedGitHubPR?: number | null
    fallbackGitHubPR?: number | null
    linkedGitLabMR?: number | null
    linkedBitbucketPR?: number | null
    linkedAzureDevOpsPR?: number | null
    linkedGiteaPR?: number | null
    recordStats?: boolean
    throwOnProviderError?: boolean
    signal?: AbortSignal
  }): Promise<HostedReviewInfo | null>

  abstract getHostedReviewCreationEligibility(
    args: Omit<HostedReviewCreationEligibilityArgs, 'repoPath'> & {
      repoSelector: string
      worktreeSelector?: string
    }
  ): Promise<HostedReviewCreationEligibility>

  abstract createHostedReview(
    args: CreateHostedReviewInput & { repoSelector: string; worktreeSelector?: string }
  ): Promise<CreateHostedReviewResult>

  abstract listGitLabRepoMRs(
    repoSelector: string,
    state?: MRListState,
    page?: number,
    perPage?: number,
    query?: string
  ): Promise<Awaited<ReturnType<typeof listGitLabMergeRequests>>>

  abstract diagnoseGitLabAuth(): Promise<Awaited<ReturnType<typeof diagnoseGitLabAuthClient>>>

  abstract getGitLabRateLimit(options?: {
    force?: boolean
    host?: string | null
  }): Promise<Awaited<ReturnType<typeof getGitLabRateLimit>>>

  abstract listGitLabRepoLabels(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listGitLabLabels>>>

  abstract addGitLabRepoMRComment(
    repoSelector: string,
    iid: number,
    body: string,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof addGitLabMRComment>>>

  abstract addGitLabRepoMRInlineComment(
    repoSelector: string,
    iid: number,
    input: GitLabMRInlineCommentInput,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof addGitLabMRInlineComment>>>
}
