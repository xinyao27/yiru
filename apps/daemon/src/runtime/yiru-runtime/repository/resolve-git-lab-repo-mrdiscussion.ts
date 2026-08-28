import type { GitLabProjectRef } from '@yiru/runtime-protocol/workbench/types'
import {
  closeMR as closeGitLabMR,
  getAuthenticatedViewer as getGitLabViewerClient,
  getJobTrace as getGitLabJobTrace,
  getProjectSlug as getGitLabProjectSlug,
  getWorkItemByProjectRef as getGitLabWorkItemByProjectRef,
  mergeMR as mergeGitLabMR,
  reopenMR as reopenGitLabMR,
  resolveMRDiscussion as resolveGitLabMRDiscussion,
  retryJob as retryGitLabJob,
  updateMR as updateGitLabMR,
  updateMRReviewers as updateGitLabMRReviewers
} from '~main/gitlab/client'
import { getWorkItemDetails as getGitLabWorkItemDetails } from '~main/gitlab/work-item-details'

import type { RepositoryServiceContext } from './service-context'

export const resolveGitLabRepoMrdiscussionMethods = {
  async resolveGitLabRepoMRDiscussion(
    repoSelector: string,
    iid: number,
    discussionId: string,
    resolved: boolean,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof resolveGitLabMRDiscussion>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return resolveGitLabMRDiscussion(
      repo.path,
      iid,
      discussionId,
      resolved,
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  },

  async getGitLabRepoJobTrace(
    repoSelector: string,
    jobId: number,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof getGitLabJobTrace>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getGitLabJobTrace(
      repo.path,
      jobId,
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  },

  async retryGitLabRepoJob(
    repoSelector: string,
    jobId: number,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof retryGitLabJob>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return retryGitLabJob(
      repo.path,
      jobId,
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  },

  async mergeGitLabRepoMR(
    repoSelector: string,
    iid: number,
    method?: 'merge' | 'squash' | 'rebase',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof mergeGitLabMR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return mergeGitLabMR(
      repo.path,
      iid,
      method ?? 'merge',
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  },

  async updateGitLabRepoMRState(
    repoSelector: string,
    iid: number,
    state: 'opened' | 'closed',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof closeGitLabMR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return state === 'closed'
      ? closeGitLabMR(
          repo.path,
          iid,
          repo.forgeRemotePreference,
          null,
          projectRef,
          ...this.getLocalGitExecutionOptionArgs(repo)
        )
      : reopenGitLabMR(
          repo.path,
          iid,
          repo.forgeRemotePreference,
          null,
          projectRef,
          ...this.getLocalGitExecutionOptionArgs(repo)
        )
  },

  async updateGitLabRepoMR(
    repoSelector: string,
    iid: number,
    updates: { title?: string; body?: string; addLabels?: string[]; removeLabels?: string[] },
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof updateGitLabMR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updateGitLabMR(
      repo.path,
      iid,
      updates,
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  },

  async updateGitLabRepoMRReviewers(
    repoSelector: string,
    iid: number,
    reviewerIds: number[],
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof updateGitLabMRReviewers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updateGitLabMRReviewers(
      repo.path,
      iid,
      reviewerIds,
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  },

  async getGitLabRepoWorkItemDetails(
    repoSelector: string,
    iid: number,
    type: 'mr',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof getGitLabWorkItemDetails>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getGitLabWorkItemDetails(
      repo.path,
      iid,
      type,
      repo.forgeRemotePreference,
      null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  },

  async getGitLabRepoWorkItemByPath(
    repoSelector: string,
    projectRef: GitLabProjectRef,
    iid: number,
    type: 'mr'
  ): Promise<Awaited<ReturnType<typeof getGitLabWorkItemByProjectRef>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return await getGitLabWorkItemByProjectRef(
      repo.path,
      projectRef,
      iid,
      type,
      null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  },

  async getGitLabViewer(): Promise<Awaited<ReturnType<typeof getGitLabViewerClient>>> {
    return getGitLabViewerClient()
  },

  async getGitLabRepoProjectSlug(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof getGitLabProjectSlug>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options = this.getHostedReviewExecutionOptions(repo)
    return options
      ? getGitLabProjectSlug(repo.path, null, options)
      : getGitLabProjectSlug(repo.path, null)
  }
} satisfies ThisType<RepositoryServiceContext>
