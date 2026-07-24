import { resolve } from 'node:path'

import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
/* eslint-disable max-lines -- Why: parallel to ipc/github.ts — keeping all
GitLab IPC handlers co-located keeps the repo-path validation pattern
reviewable as one surface. */
import { ipcMain } from 'electron'

import type { ProjectSourceContext } from '../../shared/project-source-context'
import type { GitLabMRInlineCommentInput, GitLabMRUpdate, Repo } from '../../shared/types'
import {
  addMRInlineComment,
  addMRComment,
  closeMR,
  diagnoseAuth,
  getAuthenticatedViewer,
  getJobTrace,
  getMergeRequest,
  getMergeRequestForBranch,
  getProjectSlug,
  getRateLimit,
  getWorkItemByProjectRef,
  listAssignableUsers,
  listLabels,
  listMergeRequests,
  mergeMR,
  reopenMR,
  resolveMRDiscussion,
  retryJob,
  updateMR,
  updateMRReviewers
} from '../gitlab/client'
import {
  normalizeGitLabMRListState,
  normalizeGitLabPositiveInteger,
  normalizeGitLabSearchQuery
} from '../gitlab/gitlab-preload-args'
import type { LocalGitExecOptions } from '../gitlab/gitlab-project-ref-resolution'
import type { ProjectRef } from '../gitlab/gl-utils'
import { getWorkItemDetails } from '../gitlab/work-item-details'
import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import type { HostedReviewExecutionOptions } from '../source-control/hosted-review-git-options'

type GitLabRepoSelectorArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: ProjectSourceContext | null
}

function findRegisteredGitLabRepo(args: GitLabRepoSelectorArgs, store: Store): Repo | undefined {
  const sourceRepoId =
    args.sourceContext?.provider === 'gitlab' ? args.sourceContext.repoId?.trim() : null
  const repoId = args.repoId?.trim() || sourceRepoId || null
  if (repoId) {
    const repo = store.getRepo(repoId)
    if (repo) {
      return repo
    }
  }
  const resolvedRepoPath = resolve(args.repoPath)
  return store.getRepos().find((r) => resolve(r.path) === resolvedRepoPath)
}

// Why: mirror github.ts assertRegisteredRepo — main-process handlers
// must never operate on a path the user hasn't explicitly registered as
// a repo (filesystem-auth boundary). Source context adds a host check so a
// task fetched from one machine cannot mutate a same-path repo on another.
function assertRegisteredRepo(args: GitLabRepoSelectorArgs, store: Store): Repo {
  const repo = findRegisteredGitLabRepo(args, store)
  if (!repo) {
    throw new Error('Access denied: unknown repository path')
  }
  if (
    args.sourceContext?.provider === 'gitlab' &&
    args.sourceContext.hostId !== getRepoExecutionHostId(repo)
  ) {
    throw new Error('Access denied: GitLab source host does not match repository host')
  }
  return repo
}

function repoConnectionId(repo: Repo): string | null {
  return repo.connectionId ?? null
}

function localGitOptionArgs(store: Store, repo: Repo): [] | [LocalGitExecOptions] {
  const localGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
  return localGitOptions.wslDistro ? [{ wslDistro: localGitOptions.wslDistro }] : []
}

function hostedReviewOptionArgs(store: Store, repo: Repo): [] | [HostedReviewExecutionOptions] {
  const localGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
  return localGitOptions.wslDistro
    ? [{ localGitExecOptions: { wslDistro: localGitOptions.wslDistro } }]
    : []
}

export function registerGitLabHandlers(store: Store): void {
  ipcMain.handle('gitlab:viewer', async () => {
    return getAuthenticatedViewer()
  })

  ipcMain.handle('gitlab:diagnoseAuth', async () => diagnoseAuth())

  ipcMain.handle(
    'gitlab:rateLimit',
    async (_event, args?: { force?: boolean; host?: string | null }) =>
      getRateLimit({ force: Boolean(args?.force), host: args?.host ?? null })
  )

  ipcMain.handle('gitlab:projectSlug', async (_event, args: GitLabRepoSelectorArgs) => {
    const repo = assertRegisteredRepo(args, store)
    return getProjectSlug(repo.path, repoConnectionId(repo), ...hostedReviewOptionArgs(store, repo))
  })

  ipcMain.handle(
    'gitlab:mrForBranch',
    async (
      _event,
      args: GitLabRepoSelectorArgs & { branch: string; linkedMRIid?: number | null }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return getMergeRequestForBranch(
        repo.path,
        args.branch,
        args.linkedMRIid ?? null,
        repoConnectionId(repo),
        ...hostedReviewOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle('gitlab:mr', async (_event, args: GitLabRepoSelectorArgs & { iid: number }) => {
    const repo = assertRegisteredRepo(args, store)
    return getMergeRequest(
      repo.path,
      args.iid,
      repoConnectionId(repo),
      ...hostedReviewOptionArgs(store, repo)
    )
  })

  ipcMain.handle(
    'gitlab:listMRs',
    async (
      _event,
      args: {
        repoPath: string
        repoId?: string | null
        sourceContext?: ProjectSourceContext | null
        state?: 'opened' | 'merged' | 'closed' | 'all'
        page?: number
        perPage?: number
        query?: string
      }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      const state = normalizeGitLabMRListState(args.state)
      const page = normalizeGitLabPositiveInteger(args.page, 1, 10_000)
      const perPage = normalizeGitLabPositiveInteger(args.perPage, 20, 100)
      return listMergeRequests(
        repo.path,
        state,
        page,
        perPage,
        repo.forgeRemotePreference,
        normalizeGitLabSearchQuery(args.query),
        repoConnectionId(repo),
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle('gitlab:listLabels', async (_event, args: GitLabRepoSelectorArgs) => {
    const repo = assertRegisteredRepo(args, store)
    return listLabels(
      repo.path,
      repo.forgeRemotePreference,
      repoConnectionId(repo),
      ...localGitOptionArgs(store, repo)
    )
  })

  ipcMain.handle('gitlab:listAssignableUsers', async (_event, args: GitLabRepoSelectorArgs) => {
    const repo = assertRegisteredRepo(args, store)
    return listAssignableUsers(
      repo.path,
      repo.forgeRemotePreference,
      repoConnectionId(repo),
      ...localGitOptionArgs(store, repo)
    )
  })

  // Why: aggregated dialog payload — body + discussions + pipeline jobs.
  // Powers GitLabItemDialog's tabs.
  ipcMain.handle(
    'gitlab:workItemDetails',
    async (_event, args: GitLabRepoSelectorArgs & { iid: number; type: 'mr' }) => {
      const repo = assertRegisteredRepo(args, store)
      return getWorkItemDetails(
        repo.path,
        args.iid,
        args.type,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        undefined,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:closeMR',
    async (_event, args: GitLabRepoSelectorArgs & { iid: number }) => {
      const repo = assertRegisteredRepo(args, store)
      return closeMR(
        repo.path,
        args.iid,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        undefined,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:reopenMR',
    async (_event, args: GitLabRepoSelectorArgs & { iid: number }) => {
      const repo = assertRegisteredRepo(args, store)
      return reopenMR(
        repo.path,
        args.iid,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        undefined,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:mergeMR',
    async (
      _event,
      args: GitLabRepoSelectorArgs & { iid: number; method?: 'merge' | 'squash' | 'rebase' }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return mergeMR(
        repo.path,
        args.iid,
        args.method ?? 'merge',
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        undefined,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:updateMR',
    async (_event, args: GitLabRepoSelectorArgs & { iid: number; updates: GitLabMRUpdate }) => {
      const repo = assertRegisteredRepo(args, store)
      return updateMR(
        repo.path,
        args.iid,
        args.updates,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        undefined,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:updateMRReviewers',
    async (
      _event,
      args: {
        repoPath: string
        repoId?: string | null
        sourceContext?: ProjectSourceContext | null
        iid: number
        reviewerIds: number[]
        projectRef?: ProjectRef | null
      }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return updateMRReviewers(
        repo.path,
        args.iid,
        args.reviewerIds,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        args.projectRef,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:addMRComment',
    async (_event, args: GitLabRepoSelectorArgs & { iid: number; body: string }) => {
      const repo = assertRegisteredRepo(args, store)
      return addMRComment(
        repo.path,
        args.iid,
        args.body,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        undefined,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:addMRInlineComment',
    async (
      _event,
      args: {
        repoPath: string
        repoId?: string | null
        sourceContext?: ProjectSourceContext | null
        iid: number
        input: GitLabMRInlineCommentInput
        projectRef?: ProjectRef | null
      }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return addMRInlineComment(
        repo.path,
        args.iid,
        args.input,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        args.projectRef,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:resolveMRDiscussion',
    async (
      _event,
      args: GitLabRepoSelectorArgs & { iid: number; discussionId: string; resolved: boolean }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return resolveMRDiscussion(
        repo.path,
        args.iid,
        args.discussionId,
        args.resolved,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        undefined,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:jobTrace',
    async (
      _event,
      args: GitLabRepoSelectorArgs & { jobId: number; projectRef?: ProjectRef | null }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return getJobTrace(
        repo.path,
        args.jobId,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        args.projectRef,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:retryJob',
    async (
      _event,
      args: GitLabRepoSelectorArgs & { jobId: number; projectRef?: ProjectRef | null }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return retryJob(
        repo.path,
        args.jobId,
        repo.forgeRemotePreference,
        repoConnectionId(repo),
        args.projectRef,
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gitlab:workItemByPath',
    async (
      _event,
      args: GitLabRepoSelectorArgs & {
        host: string
        path: string
        iid: number
        type: 'mr'
      }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      const projectRef: ProjectRef = { host: args.host, path: args.path }
      const result = await getWorkItemByProjectRef(
        repo.path,
        projectRef,
        args.iid,
        args.type,
        repoConnectionId(repo),
        ...localGitOptionArgs(store, repo)
      )
      return result
    }
  )
}
