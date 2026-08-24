import { isWslUncPath } from '@yiru/workbench-model/platform'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import { invalidateAuthorizedRootsCache } from '~main/filesystem/auth'
import { getBaseRefDefault, searchBaseRefDetails, getRemoteCount } from '~main/git/repo'
import { getRepoSlug } from '~main/github/client'
import {
  getLocalProjectWorktreeGitOptions,
  resolveLocalProjectRuntimeForRepo
} from '~main/project-runtime-git-options'
import { prepareLocalWorktreeRootForRepo } from '~main/worktree-root-preparation'
import { isFolderRepo } from '~shared/repo-kind'
import type { RuntimeRepoSearchRefs } from '~shared/runtime-types'
import type { Repo } from '~shared/types'

import { DEFAULT_REPO_SEARCH_REFS_LIMIT } from '../model/runtime-limits'
import { getAgentLaunchPlatform } from '../model/terminal-startup'
import type { TerminalWorkspaceLaunchScope } from '../model/worktree-resolution'
import { omitUndefinedProperties } from '../model/worktree-storage'
import { RuntimeRepositoryCloneRepoAfterPathLock } from './clone-repo-after-path-lock'

export abstract class RuntimeRepositoryUpdateRepo extends RuntimeRepositoryCloneRepoAfterPathLock {
  async updateRepo(
    repoSelector: string,
    updates: Partial<
      Pick<
        Repo,
        | 'displayName'
        | 'badgeColor'
        | 'repoIcon'
        | 'upstream'
        | 'hookSettings'
        | 'worktreeBaseRef'
        | 'worktreeBasePath'
        | 'kind'
        | 'symlinkPaths'
        | 'forgeRemotePreference'
        | 'externalWorktreeVisibility'
        | 'externalWorktreeVisibilityPromptDismissedAt'
        | 'externalWorktreeInboxBaselinePaths'
        | 'importedExternalWorktreePaths'
        | 'projectGroupId'
        | 'projectGroupOrder'
      >
    > & {
      sourceControlAi?: Repo['sourceControlAi'] | null
      externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
    }
  ): Promise<Repo> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    const sanitizedUpdates = omitUndefinedProperties(updates)
    if ('worktreeBasePath' in updates && updates.worktreeBasePath === undefined) {
      sanitizedUpdates.worktreeBasePath = undefined
    }
    if (
      'externalWorktreeDiscoverySuppressedAt' in updates &&
      updates.externalWorktreeDiscoverySuppressedAt === null
    ) {
      sanitizedUpdates.externalWorktreeDiscoverySuppressedAt = undefined
    }
    if ('sourceControlAi' in updates && updates.sourceControlAi === null) {
      sanitizedUpdates.sourceControlAi = null
    }
    const updated = this.store.updateRepo(repo.id, sanitizedUpdates)
    if (!updated) {
      throw new Error('repo_not_found')
    }
    if ('worktreeBasePath' in updates) {
      await prepareLocalWorktreeRootForRepo(this.store, updated)
      invalidateAuthorizedRootsCache()
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return updated
  }

  async removeProject(repoSelector: string): Promise<{ removed: true }> {
    if (!this.store?.removeProject) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    this.store.removeProject(repo.id)
    this.invalidateResolvedWorktreeCache()
    invalidateAuthorizedRootsCache()
    this.notifyReposChanged()
    return { removed: true }
  }

  async inspectTerminalProcess(
    terminalSelector: string
  ): Promise<{ foregroundProcess: string | null; hasChildProcesses: boolean }> {
    const leaf = this.resolveLeafForHandle(terminalSelector)
    if (!leaf?.ptyId || !this.ptyController) {
      return { foregroundProcess: null, hasChildProcesses: false }
    }
    const foregroundProcess = await this.ptyController.getForegroundProcess(leaf.ptyId)
    const hasChildProcesses =
      (await this.ptyController.hasChildProcesses?.(leaf.ptyId).catch(() => false)) ?? false
    return { foregroundProcess, hasChildProcesses }
  }

  reorderRepos(orderedIds: string[]): { status: 'applied' | 'rejected' } {
    if (!this.store?.reorderRepos) {
      throw new Error('runtime_unavailable')
    }
    // Why: remote clients can race repo add/remove on the server just like
    // local drag-reorder can race another window. Let the store validate the
    // full permutation and signal a resync-worthy rejection.
    const applied = this.store.reorderRepos(orderedIds)
    if (!applied) {
      return { status: 'rejected' }
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return { status: 'applied' }
  }

  async searchRepoRefs(
    repoSelector: string,
    query: string,
    limit = DEFAULT_REPO_SEARCH_REFS_LIMIT,
    hostId?: ExecutionHostId
  ): Promise<RuntimeRepoSearchRefs> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('invalid_limit')
    }
    const repo = await this.resolveRepoSelector(repoSelector, hostId)
    if (isFolderRepo(repo)) {
      return {
        refs: [],
        truncated: false
      }
    }
    const refDetails = await searchBaseRefDetails(repo.path, query, limit + 1)
    return {
      refs: refDetails.slice(0, limit).map((entry) => entry.refName),
      refDetails: refDetails.slice(0, limit),
      truncated: refDetails.length > limit
    }
  }

  async getRepoBaseRefDefault(
    repoSelector: string,
    hostId?: ExecutionHostId
  ): Promise<{ defaultBaseRef: string | null; remoteCount: number }> {
    const repo = await this.resolveRepoSelector(repoSelector, hostId)
    if (isFolderRepo(repo)) {
      return { defaultBaseRef: null, remoteCount: 0 }
    }
    const [defaultBaseRef, remoteCount] = await Promise.all([
      getBaseRefDefault(repo.path),
      getRemoteCount(repo.path)
    ])
    return { defaultBaseRef, remoteCount }
  }

  protected async resolveHostedReviewTarget(args: {
    repoSelector: string
    worktreeSelector?: string
  }): Promise<{ repo: Repo; repoPath: string }> {
    const repo = await this.resolveRepoSelector(args.repoSelector)
    if (!args.worktreeSelector) {
      return { repo, repoPath: repo.path }
    }

    const worktree = await this.resolveWorktreeSelector(args.worktreeSelector)
    if (worktree.repoId !== repo.id) {
      throw new Error('Access denied: worktree does not belong to repository')
    }
    return { repo, repoPath: worktree.path }
  }

  protected getHostedReviewExecutionOptions(
    repo: Repo
  ): { localGitExecOptions: { wslDistro?: string } } | undefined {
    const localGitOptions = this.getLocalGitExecutionOptionArgs(repo)[0] ?? {}
    return Object.keys(localGitOptions).length > 0
      ? { localGitExecOptions: localGitOptions }
      : undefined
  }

  protected getLocalGitExecutionOptionArgs(repo: Repo): [] | [{ wslDistro?: string }] {
    const localGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    return Object.keys(localGitOptions).length > 0 ? [localGitOptions] : []
  }

  protected getAgentLaunchPlatformForRepo(repo: Repo): NodeJS.Platform {
    const projectRuntime = resolveLocalProjectRuntimeForRepo(this.requireStore(), repo)
    return getAgentLaunchPlatform(projectRuntime)
  }

  protected getAgentLaunchPlatformForWorkspace(
    scope: TerminalWorkspaceLaunchScope
  ): NodeJS.Platform {
    if (scope.repo) {
      return this.getAgentLaunchPlatformForRepo(scope.repo)
    }
    return isWslUncPath(scope.path) ? 'linux' : process.platform
  }

  async getRepoSlug(repoSelector: string): Promise<{ owner: string; repo: string } | null> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options = this.getHostedReviewExecutionOptions(repo)
    return options ? getRepoSlug(repo.path, null, options) : getRepoSlug(repo.path, null)
  }
}
