import {
  mergePR,
  setPRAutoMerge,
  updatePRState,
  requestPRReviewers,
  removePRReviewers,
  addPullRequestComment,
  addPRReviewComment,
  addPRReviewCommentReply
} from '~main/github/client'
import type { GitHubOwnerRepo } from '~shared/types'
import type { GitHubPullRequestStateUpdate, GitHubPRReviewCommentInput } from '~shared/types'

import { RuntimeRepositoryGetGitLabRepoMrforBranch } from './get-git-lab-repo-mrfor-branch'

export abstract class RuntimeRepositoryMergeRepoPr extends RuntimeRepositoryGetGitLabRepoMrforBranch {
  async mergeRepoPR(
    repoSelector: string,
    prNumber: number,
    method?: 'merge' | 'squash' | 'rebase',
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof mergePR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return mergePR(
      repo.path,
      prNumber,
      method,
      null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async setRepoPRAutoMerge(
    repoSelector: string,
    prNumber: number,
    enabled: boolean,
    method?: 'merge' | 'squash' | 'rebase',
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof setPRAutoMerge>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return setPRAutoMerge(
      repo.path,
      prNumber,
      enabled,
      method,
      null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async updateRepoPRState(
    repoSelector: string,
    prNumber: number,
    updates: GitHubPullRequestStateUpdate
  ): Promise<Awaited<ReturnType<typeof updatePRState>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updatePRState(
      repo.path,
      prNumber,
      updates,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async requestRepoPRReviewers(
    repoSelector: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<Awaited<ReturnType<typeof requestPRReviewers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return requestPRReviewers(
      repo.path,
      prNumber,
      reviewers,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async removeRepoPRReviewers(
    repoSelector: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<Awaited<ReturnType<typeof removePRReviewers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return removePRReviewers(
      repo.path,
      prNumber,
      reviewers,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async addRepoPRComment(
    repoSelector: string,
    number: number,
    body: string,
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof addPullRequestComment>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addPullRequestComment(
      repo.path,
      number,
      body,
      null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async addRepoPRReviewComment(
    repoSelector: string,
    args: Omit<GitHubPRReviewCommentInput, 'repoPath'>
  ): Promise<Awaited<ReturnType<typeof addPRReviewComment>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addPRReviewComment({
      repoPath: repo.path,
      connectionId: null,
      localGitOptions: this.getLocalGitExecutionOptionArgs(repo)[0],
      ...args
    })
  }

  async addRepoPRReviewCommentReply(
    repoSelector: string,
    args: {
      prNumber: number
      commentId: number
      body: string
      threadId?: string
      path?: string
      line?: number
      prRepo?: GitHubOwnerRepo | null
    }
  ): Promise<Awaited<ReturnType<typeof addPRReviewCommentReply>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addPRReviewCommentReply(
      repo.path,
      args.prNumber,
      args.commentId,
      args.body,
      args.threadId,
      args.path,
      args.line,
      null,
      args.prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }
}
