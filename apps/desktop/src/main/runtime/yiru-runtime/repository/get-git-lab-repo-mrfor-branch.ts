import {
  getPRChecks,
  getPRCheckDetails,
  rerunPRChecks,
  getPRComments,
  resolveReviewThread,
  setPRFileViewed,
  updatePRTitle,
  updatePRDetails
} from '~main/github/client'
import { getPRFileContents } from '~main/github/work-item-details'
import {
  getMergeRequest as getGitLabMR,
  getMergeRequestForBranch as getGitLabMRForBranch,
  listAssignableUsers as listGitLabAssignableUsers
} from '~main/gitlab/client'
import type { GitHubOwnerRepo } from '~shared/types'
import type { GitHubPRFile } from '~shared/types'

import { RuntimeRepositoryResolveGitLabRepoMrdiscussion } from './resolve-git-lab-repo-mrdiscussion'

export abstract class RuntimeRepositoryGetGitLabRepoMrforBranch extends RuntimeRepositoryResolveGitLabRepoMrdiscussion {
  async getGitLabRepoMRForBranch(
    repoSelector: string,
    branch: string,
    linkedMRIid?: number | null
  ): Promise<Awaited<ReturnType<typeof getGitLabMRForBranch>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options = this.getHostedReviewExecutionOptions(repo)
    return getGitLabMRForBranch(repo.path, branch, linkedMRIid ?? null, null, options ?? {})
  }

  async getGitLabRepoMR(
    repoSelector: string,
    iid: number
  ): Promise<Awaited<ReturnType<typeof getGitLabMR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options = this.getHostedReviewExecutionOptions(repo)
    return options ? getGitLabMR(repo.path, iid, null, options) : getGitLabMR(repo.path, iid, null)
  }

  async listGitLabRepoAssignableUsers(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listGitLabAssignableUsers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listGitLabAssignableUsers(
      repo.path,
      repo.forgeRemotePreference,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoPRChecks(
    repoSelector: string,
    prNumber: number,
    headSha?: string,
    prRepo?: GitHubOwnerRepo | null,
    options?: { noCache?: boolean; signal?: AbortSignal }
  ): Promise<Awaited<ReturnType<typeof getPRChecks>>> {
    options?.signal?.throwIfAborted()
    const repo = await this.resolveRepoSelector(repoSelector)
    options?.signal?.throwIfAborted()
    return getPRChecks(
      repo.path,
      prNumber,
      headSha,
      prRepo ?? null,
      options,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async rerunRepoPRChecks(
    repoSelector: string,
    prNumber: number,
    options?: { headSha?: string; failedOnly?: boolean }
  ): Promise<Awaited<ReturnType<typeof rerunPRChecks>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return rerunPRChecks(
      repo.path,
      prNumber,
      options,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoPRCheckDetails(
    repoSelector: string,
    args: {
      checkRunId?: number
      workflowRunId?: number
      checkName?: string
      url?: string | null
      prRepo?: GitHubOwnerRepo | null
    }
  ): Promise<Awaited<ReturnType<typeof getPRCheckDetails>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getPRCheckDetails(
      repo.path,
      { ...args, prRepo: args.prRepo ?? null },
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoPRComments(
    repoSelector: string,
    prNumber: number,
    prRepo?: GitHubOwnerRepo | null,
    options?: { noCache?: boolean }
  ): Promise<Awaited<ReturnType<typeof getPRComments>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getPRComments(
      repo.path,
      prNumber,
      { ...options, prRepo: prRepo ?? null },
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoPRFileContents(
    repoSelector: string,
    args: {
      prNumber: number
      path: string
      oldPath?: string
      status: GitHubPRFile['status']
      headSha: string
      baseSha: string
    }
  ): Promise<Awaited<ReturnType<typeof getPRFileContents>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getPRFileContents({
      repoPath: repo.path,
      connectionId: null,
      localGitOptions: this.getLocalGitExecutionOptionArgs(repo)[0],
      ...args
    })
  }

  async resolveRepoReviewThread(
    repoSelector: string,
    threadId: string,
    resolve: boolean
  ): Promise<Awaited<ReturnType<typeof resolveReviewThread>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return resolveReviewThread(
      repo.path,
      threadId,
      resolve,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async setRepoPRFileViewed(
    repoSelector: string,
    args: {
      pullRequestId: string
      path: string
      viewed: boolean
    }
  ): Promise<Awaited<ReturnType<typeof setPRFileViewed>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return setPRFileViewed({
      repoPath: repo.path,
      connectionId: null,
      localGitOptions: this.getLocalGitExecutionOptionArgs(repo)[0],
      ...args
    })
  }

  async updateRepoPRTitle(
    repoSelector: string,
    prNumber: number,
    title: string,
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof updatePRTitle>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updatePRTitle(
      repo.path,
      prNumber,
      title,
      null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async updateRepoPRDetails(
    repoSelector: string,
    prNumber: number,
    updates: { title?: string; body?: string },
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof updatePRDetails>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updatePRDetails(
      repo.path,
      prNumber,
      updates,
      null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }
}
