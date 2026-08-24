import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult,
  HostedReviewCreationEligibility,
  HostedReviewCreationEligibilityArgs,
  HostedReviewInfo
} from '@yiru/workbench-model/review'
import {
  diagnoseAuth as diagnoseGitLabAuthClient,
  getRateLimit as getGitLabRateLimit,
  addMRInlineComment as addGitLabMRInlineComment,
  addMRComment as addGitLabMRComment,
  listLabels as listGitLabLabels,
  listMergeRequests as listGitLabMergeRequests
} from '~main/gitlab/client'
import {
  normalizeGitLabMRListState,
  normalizeGitLabPositiveInteger
} from '~main/gitlab/preload-args'
import { getHostedReviewForBranch as getHostedReviewForBranchFromRepo } from '~main/source-control/hosted-review'
import {
  createHostedReview as createHostedReviewFromRepo,
  getHostedReviewCreationEligibility as getHostedReviewCreationEligibilityFromRepo
} from '~main/source-control/hosted-review-creation'
import type { GitLabMRInlineCommentInput, GitLabProjectRef, MRListState } from '~shared/types'

import { RuntimeRepositoryGetRepoUpstream } from './get-repo-upstream'

export abstract class RuntimeRepositoryGetHostedReviewForBranch extends RuntimeRepositoryGetRepoUpstream {
  async getHostedReviewForBranch(args: {
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
  }): Promise<HostedReviewInfo | null> {
    args.signal?.throwIfAborted()
    const repo = await this.resolveRepoSelector(args.repoSelector)
    args.signal?.throwIfAborted()
    const executionOptions = this.getHostedReviewExecutionOptions(repo)
    const review = await getHostedReviewForBranchFromRepo({
      repoPath: repo.path,
      connectionId: null,
      branch: args.branch,
      currentHeadOid: args.currentHeadOid ?? null,
      linkedGitHubPR: args.linkedGitHubPR ?? null,
      fallbackGitHubPR: args.linkedGitHubPR == null ? (args.fallbackGitHubPR ?? null) : null,
      linkedGitLabMR: args.linkedGitLabMR ?? null,
      linkedBitbucketPR: args.linkedBitbucketPR ?? null,
      linkedAzureDevOpsPR: args.linkedAzureDevOpsPR ?? null,
      linkedGiteaPR: args.linkedGiteaPR ?? null,
      ...(args.throwOnProviderError ? { throwOnProviderError: true } : {}),
      ...(args.signal ? { signal: args.signal } : {}),
      ...executionOptions
    })
    // Why: public Coworking reads inspect existing reviews and must not attribute them as newly created.
    if (
      args.recordStats !== false &&
      review?.provider === 'github' &&
      this.stats &&
      !this.stats.hasCountedPR(review.url)
    ) {
      this.stats.record({
        type: 'pr_created',
        at: Date.now(),
        repoId: repo.id,
        meta: { prNumber: review.number, prUrl: review.url }
      })
    }
    return review
  }

  async getHostedReviewCreationEligibility(
    args: Omit<HostedReviewCreationEligibilityArgs, 'repoPath'> & {
      repoSelector: string
      worktreeSelector?: string
    }
  ): Promise<HostedReviewCreationEligibility> {
    const { repo, repoPath } = await this.resolveHostedReviewTarget(args)
    const executionOptions = this.getHostedReviewExecutionOptions(repo)
    return getHostedReviewCreationEligibilityFromRepo({
      repoPath,
      connectionId: null,
      branch: args.branch,
      base: args.base ?? null,
      hasUncommittedChanges: args.hasUncommittedChanges,
      hasUpstream: args.hasUpstream,
      ahead: args.ahead,
      behind: args.behind,
      linkedGitHubPR: args.linkedGitHubPR ?? null,
      fallbackGitHubPR: args.linkedGitHubPR == null ? (args.fallbackGitHubPR ?? null) : null,
      linkedGitLabMR: args.linkedGitLabMR ?? null,
      linkedBitbucketPR: args.linkedBitbucketPR ?? null,
      linkedAzureDevOpsPR: args.linkedAzureDevOpsPR ?? null,
      linkedGiteaPR: args.linkedGiteaPR ?? null,
      ...executionOptions
    })
  }

  async createHostedReview(
    args: CreateHostedReviewInput & { repoSelector: string; worktreeSelector?: string }
  ): Promise<CreateHostedReviewResult> {
    const { repo, repoPath } = await this.resolveHostedReviewTarget(args)
    const executionOptions = this.getHostedReviewExecutionOptions(repo)
    const input = {
      provider: args.provider,
      base: args.base,
      head: args.head,
      title: args.title,
      body: args.body,
      draft: args.draft,
      ...(args.useTemplate !== undefined ? { useTemplate: args.useTemplate } : {})
    }
    const result = executionOptions
      ? await createHostedReviewFromRepo(repoPath, input, null, executionOptions)
      : await createHostedReviewFromRepo(repoPath, input, null)
    if (result.ok && this.stats && !this.stats.hasCountedPR(result.url)) {
      this.stats.record({
        type: 'pr_created',
        at: Date.now(),
        repoId: repo.id,
        meta: { prNumber: result.number, prUrl: result.url }
      })
    }
    return result
  }

  async listGitLabRepoMRs(
    repoSelector: string,
    state?: MRListState,
    page?: number,
    perPage?: number,
    query?: string
  ): Promise<Awaited<ReturnType<typeof listGitLabMergeRequests>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listGitLabMergeRequests(
      repo.path,
      normalizeGitLabMRListState(state),
      normalizeGitLabPositiveInteger(page, 1, 10_000),
      normalizeGitLabPositiveInteger(perPage, 20, 100),
      repo.forgeRemotePreference,
      query,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async diagnoseGitLabAuth(): Promise<Awaited<ReturnType<typeof diagnoseGitLabAuthClient>>> {
    return diagnoseGitLabAuthClient()
  }

  async getGitLabRateLimit(options?: {
    force?: boolean
    host?: string | null
  }): Promise<Awaited<ReturnType<typeof getGitLabRateLimit>>> {
    return getGitLabRateLimit(options)
  }

  async listGitLabRepoLabels(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listGitLabLabels>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listGitLabLabels(
      repo.path,
      repo.forgeRemotePreference,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async addGitLabRepoMRComment(
    repoSelector: string,
    iid: number,
    body: string,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof addGitLabMRComment>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addGitLabMRComment(
      repo.path,
      iid,
      body,
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async addGitLabRepoMRInlineComment(
    repoSelector: string,
    iid: number,
    input: GitLabMRInlineCommentInput,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof addGitLabMRInlineComment>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addGitLabMRInlineComment(
      repo.path,
      iid,
      input,
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }
}
