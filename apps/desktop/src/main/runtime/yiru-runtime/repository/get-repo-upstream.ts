import type { PRRefreshOutcome } from '@yiru/workbench-model/review'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { githubAvatarIcon } from '@yiru/workbench-model/workspace'
import {
  type getPRForBranch,
  getPRForBranchOutcome,
  getRepoUpstream,
  getWorkItem,
  listWorkItems,
  getWorkItemByOwnerRepo,
  listPullRequestLabels,
  listPullRequestAssignableUsers,
  type MainWorkItem
} from '~main/github/client'
import type { GitHubPRBranchLookupOptions } from '~main/github/client'
import { getRateLimit } from '~main/github/rate-limit'
import { getWorkItemDetails } from '~main/github/work-item-details'
import { getGlabKnownHosts, resolveProjectRemote } from '~main/gitlab/gitlab-cli'
import { getLocalProjectWorktreeGitOptions } from '~main/project-runtime-git-options'
import type { Repo } from '~shared/types'
import type { GitLabProjectRef, ListWorkItemsResult } from '~shared/types'

import { RuntimeRepositoryUpdateRepo } from './update-repo'

export abstract class RuntimeRepositoryGetRepoUpstream extends RuntimeRepositoryUpdateRepo {
  async getRepoUpstream(repoSelector: string): Promise<{ owner: string; repo: string } | null> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options = this.getHostedReviewExecutionOptions(repo)
    return options ? getRepoUpstream(repo.path, null, options) : getRepoUpstream(repo.path, null)
  }

  async getGitLabRepoProjectRef(repoSelector: string): Promise<GitLabProjectRef | null> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const resolution = await resolveProjectRemote(
      repo.path,
      repo.forgeRemotePreference,
      await getGlabKnownHosts(null),
      null,
      getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    )
    return resolution.source
  }

  // Why: repos added before fork detection existed have no stored `upstream`, so
  // their avatar/badge would never self-correct. Resolve it once at startup for
  // local git repos. Sequential to respect the gh rate limit; failures leave
  // `upstream` unset so the next launch retries.

  protected async backfillForkUpstreams(): Promise<void> {
    try {
      const store = this.requireStore()
      let changed = false
      for (const repo of store.getRepos()) {
        if (
          getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID ||
          repo.upstream !== undefined ||
          repo.kind === 'folder'
        ) {
          continue
        }
        let upstream: { owner: string; repo: string } | null
        try {
          upstream = await getRepoUpstream(repo.path, null)
        } catch {
          continue
        }
        const updates: Partial<Repo> = { upstream: upstream ?? null }
        // Only migrate the auto-detected origin avatar; never touch a chosen icon.
        if (upstream && repo.repoIcon?.type === 'image' && repo.repoIcon.source === 'github') {
          updates.repoIcon = githubAvatarIcon(upstream)
        }
        store.updateRepo(repo.id, updates)
        changed = true
      }
      if (changed) {
        this.notifyReposChanged()
      }
    } catch {
      // Best-effort startup backfill; never disrupt launch.
    }
  }

  async listRepoWorkItems(
    repoSelector: string,
    limit?: number,
    query?: string,
    page?: number,
    noCache?: boolean
  ): Promise<ListWorkItemsResult<MainWorkItem>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listWorkItems(
      repo.path,
      limit,
      query,
      page,
      repo.forgeRemotePreference,
      null,
      noCache,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoWorkItem(
    repoSelector: string,
    number: number,
    type?: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItem>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getWorkItem(repo.path, number, type, null, ...this.getLocalGitExecutionOptionArgs(repo))
  }

  async getRepoWorkItemByOwnerRepo(
    repoSelector: string,
    ownerRepo: { owner: string; repo: string },
    number: number,
    type: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItemByOwnerRepo>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getWorkItemByOwnerRepo(
      repo.path,
      ownerRepo,
      number,
      type,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoWorkItemDetails(
    repoSelector: string,
    number: number,
    type?: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItemDetails>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getWorkItemDetails(
      repo.path,
      number,
      type,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async listRepoLabels(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listPullRequestLabels>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listPullRequestLabels(repo.path, null, ...this.getLocalGitExecutionOptionArgs(repo))
  }

  async listRepoAssignableUsers(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listPullRequestAssignableUsers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listPullRequestAssignableUsers(
      repo.path,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  getGitHubRateLimit(options?: {
    force?: boolean
  }): Promise<Awaited<ReturnType<typeof getRateLimit>>> {
    return getRateLimit(options)
  }

  async getRepoPRForBranch(
    repoSelector: string,
    branch: string,
    linkedPRNumber?: number | null,
    fallbackPRNumber?: number | null,
    acceptMergedFallbackPR?: boolean,
    currentHeadOid?: string | null
  ): Promise<Awaited<ReturnType<typeof getPRForBranch>>> {
    const outcome = await this.getRepoPRForBranchOutcome(
      repoSelector,
      branch,
      linkedPRNumber,
      fallbackPRNumber,
      acceptMergedFallbackPR,
      currentHeadOid
    )
    return outcome.kind === 'found' ? outcome.pr : null
  }

  async getRepoPRForBranchOutcome(
    repoSelector: string,
    branch: string,
    linkedPRNumber?: number | null,
    fallbackPRNumber?: number | null,
    acceptMergedFallbackPR?: boolean,
    currentHeadOid?: string | null
  ): Promise<PRRefreshOutcome> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options: GitHubPRBranchLookupOptions = this.getHostedReviewExecutionOptions(repo) ?? {}
    const lookupOptions = { ...options }
    if (acceptMergedFallbackPR === true) {
      lookupOptions.acceptMergedFallbackPR = true
    }
    if (typeof currentHeadOid === 'string' && currentHeadOid.trim().length > 0) {
      lookupOptions.currentHeadOid = currentHeadOid.trim()
    }
    const lookupOptionArgs: [] | [GitHubPRBranchLookupOptions] =
      Object.keys(lookupOptions).length > 0 ? [lookupOptions] : []
    return getPRForBranchOutcome(
      repo.path,
      branch,
      linkedPRNumber ?? null,
      null,
      linkedPRNumber == null ? (fallbackPRNumber ?? null) : null,
      ...lookupOptionArgs
    )
  }
}
