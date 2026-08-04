import { resolve } from 'node:path'

import type {
  CreateHostedReviewArgs,
  HostedReviewCreationEligibilityArgs,
  HostedReviewForBranchArgs
} from '@yiru/workbench-model/review'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { ipcMain } from 'electron'
import type { Repo } from '~shared/types'

import { resolveRegisteredWorktreePath } from '../filesystem/auth'
import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { listRepoWorktrees } from '../repo-worktrees'
import type { StatsCollector } from '../stats/collector'
import { getWorktreeSharedLinkPaths } from '../worktree/shared-directories'
import { getHostedReviewForBranch } from './hosted-review'
import { createHostedReview, getHostedReviewCreationEligibility } from './hosted-review-creation'

function assertRegisteredRepo(repoPath: string, store: Store, repoId?: string): Repo {
  let repo: Repo | undefined
  if (repoId) {
    repo = store
      .getRepos()
      .find(
        (candidate) =>
          candidate.id === repoId &&
          candidate.path === repoPath &&
          getRepoExecutionHostId(candidate) === LOCAL_EXECUTION_HOST_ID
      )
    if (!repo) {
      throw new Error('Access denied: unknown repository')
    }
  } else {
    const resolvedRepoPath = resolve(repoPath)
    repo = store
      .getRepos()
      .find(
        (candidate) =>
          getRepoExecutionHostId(candidate) === LOCAL_EXECUTION_HOST_ID &&
          resolve(candidate.path) === resolvedRepoPath
      )
  }
  if (!repo) {
    throw new Error('Access denied: unknown repository path')
  }
  if (getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
    throw new Error('Access denied: repository is owned by a paired runtime')
  }
  return repo
}

async function resolveHostedReviewWorktreePath(
  repo: Repo,
  store: Store,
  worktreePath?: string
): Promise<string> {
  if (!worktreePath) {
    return repo.path
  }
  const resolvedWorktreePath = await resolveRegisteredWorktreePath(worktreePath, store)
  const localGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
  const repoWorktrees =
    Object.keys(localGitOptions).length > 0
      ? await listRepoWorktrees(repo, localGitOptions)
      : await listRepoWorktrees(repo)
  if (!repoWorktrees.some((worktree) => resolve(worktree.path) === resolvedWorktreePath)) {
    throw new Error('Access denied: worktree does not belong to repository')
  }
  return resolvedWorktreePath
}

export function registerHostedReviewHandlers(store: Store, stats: StatsCollector): void {
  ipcMain.handle('hostedReview:forBranch', async (_event, args: HostedReviewForBranchArgs) => {
    const repo = assertRegisteredRepo(args.repoPath, store, args.repoId)
    const localGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
    const review = await getHostedReviewForBranch({
      repoPath: repo.path,
      connectionId: null,
      branch: args.branch,
      linkedGitHubPR: args.linkedGitHubPR ?? null,
      fallbackGitHubPR: args.linkedGitHubPR == null ? (args.fallbackGitHubPR ?? null) : null,
      linkedGitLabMR: args.linkedGitLabMR ?? null,
      linkedBitbucketPR: args.linkedBitbucketPR ?? null,
      linkedAzureDevOpsPR: args.linkedAzureDevOpsPR ?? null,
      linkedGiteaPR: args.linkedGiteaPR ?? null,
      currentHeadOid: args.currentHeadOid ?? null,
      ...(Object.keys(localGitOptions).length > 0 ? { localGitExecOptions: localGitOptions } : {})
    })
    if (review?.provider === 'github' && !stats.hasCountedPR(review.url)) {
      stats.record({
        type: 'pr_created',
        at: Date.now(),
        repoId: repo.id,
        meta: { prNumber: review.number, prUrl: review.url }
      })
    }
    return review
  })

  ipcMain.handle(
    'hostedReview:getCreationEligibility',
    async (_event, args: HostedReviewCreationEligibilityArgs) => {
      const repo = assertRegisteredRepo(args.repoPath, store, args.repoId)
      const worktreePath = await resolveHostedReviewWorktreePath(repo, store, args.worktreePath)
      const localGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
      const sharedLinkPaths = getWorktreeSharedLinkPaths(repo)
      return getHostedReviewCreationEligibility({
        ...args,
        repoPath: worktreePath,
        connectionId: null,
        ...(Object.keys(localGitOptions).length > 0
          ? { localGitExecOptions: localGitOptions }
          : {}),
        ...(sharedLinkPaths.length > 0 ? { sharedLinkPaths } : {})
      })
    }
  )

  ipcMain.handle('hostedReview:create', async (_event, args: CreateHostedReviewArgs) => {
    const repo = assertRegisteredRepo(args.repoPath, store, args.repoId)
    const worktreePath = await resolveHostedReviewWorktreePath(repo, store, args.worktreePath)
    const localGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
    const sharedLinkPaths = getWorktreeSharedLinkPaths(repo)
    const executionOptions =
      Object.keys(localGitOptions).length > 0 || sharedLinkPaths.length > 0
        ? {
            ...(Object.keys(localGitOptions).length > 0
              ? { localGitExecOptions: localGitOptions }
              : {}),
            ...(sharedLinkPaths.length > 0 ? { sharedLinkPaths } : {})
          }
        : undefined
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
      ? await createHostedReview(worktreePath, input, null, executionOptions)
      : await createHostedReview(worktreePath, input, null)
    if (result.ok && !stats.hasCountedPR(result.url)) {
      stats.record({
        type: 'pr_created',
        at: Date.now(),
        repoId: repo.id,
        meta: { prNumber: result.number, prUrl: result.url }
      })
    }
    return result
  })
}
