import type { RuntimeGitLocalBranches } from '@yiru/runtime-protocol/mobile-runtime-types'
import { checkIgnoredPaths } from '~main/git/check-ignored-paths'
import { listLocalBranches } from '~main/git/checkout'
import { getHistory as getGitHistory } from '~main/git/history'
import { findKnownHugeFolderPathsToIgnore } from '~main/git/huge-folder-ignore'
import { getRemoteCommitUrl, getRemoteFileUrl } from '~main/git/repo'
import {
  detectConflictOperation,
  getBranchCompare,
  getBranchDiff,
  getCommitCompare,
  getCommitDiff,
  getDiff,
  getStatus as getGitStatus,
  getSubmoduleStatus as getGitSubmoduleStatus
} from '~main/git/status'
import type { GitProviderStatusOptions } from '~main/providers/git-provider-status-options'
import { getWorktreeSharedLinkPaths } from '~main/worktree/shared-directories'
import type { GitHistoryOptions, GitHistoryResult } from '~shared/git/history'
import type {
  GitBranchCompareResult,
  GitCommitCompareResult,
  GitConflictOperation,
  GitDiffResult,
  GitStagingArea,
  GitStatusResult
} from '~shared/types'

import { normalizeRuntimeRelativePath } from '../relative-paths'
import {
  localGitOptionsForTarget,
  normalizeRuntimeGitRelativePath,
  RuntimeGitCommandBase
} from './context'

export class RuntimeGitReadCommands extends RuntimeGitCommandBase {
  async getRuntimeGitStatus(
    worktreeSelector: string,
    options?: GitProviderStatusOptions
  ): Promise<GitStatusResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const gitOptions = localGitOptionsForTarget(target)
    const sharedLinkPaths = target.repo ? getWorktreeSharedLinkPaths(target.repo) : []
    const sharedOptions = sharedLinkPaths.length > 0 ? { sharedLinkPaths } : {}
    return options
      ? getGitStatus(target.worktree.path, { ...options, ...gitOptions, ...sharedOptions })
      : getGitStatus(target.worktree.path, { ...gitOptions, ...sharedOptions })
  }

  async getRuntimeGitSubmoduleStatus(
    worktreeSelector: string,
    submodulePath: string,
    area: GitStagingArea = 'unstaged'
  ): Promise<GitStatusResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getGitSubmoduleStatus(target.worktree.path, submodulePath, {
      ...localGitOptionsForTarget(target),
      ...(area === 'staged' ? { staged: true } : {})
    })
  }

  async checkRuntimeGitIgnoredPaths(
    worktreeSelector: string,
    relativePaths: string[]
  ): Promise<string[]> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return checkIgnoredPaths(target.worktree.path, relativePaths, localGitOptionsForTarget(target))
  }

  async findRuntimeGitHugeFoldersToIgnore(worktreeSelector: string): Promise<string[]> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return findKnownHugeFolderPathsToIgnore(target.worktree.path, localGitOptionsForTarget(target))
  }

  async getRuntimeGitHistory(
    worktreeSelector: string,
    options: GitHistoryOptions = {}
  ): Promise<GitHistoryResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getGitHistory(target.worktree.path, {
      ...options,
      ...localGitOptionsForTarget(target)
    })
  }

  async getRuntimeGitConflictOperation(worktreeSelector: string): Promise<GitConflictOperation> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return detectConflictOperation(target.worktree.path)
  }

  async listRuntimeGitLocalBranches(worktreeSelector: string): Promise<RuntimeGitLocalBranches> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return listLocalBranches(target.worktree.path, localGitOptionsForTarget(target))
  }

  async getRuntimeGitDiff(
    worktreeSelector: string,
    filePath: string,
    staged: boolean,
    compareAgainstHead?: boolean
  ): Promise<GitDiffResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getDiff(
      target.worktree.path,
      normalizeRuntimeGitRelativePath(filePath),
      staged,
      compareAgainstHead,
      localGitOptionsForTarget(target)
    )
  }

  async getRuntimeGitBranchCompare(
    worktreeSelector: string,
    baseRef: string
  ): Promise<GitBranchCompareResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getBranchCompare(target.worktree.path, baseRef, localGitOptionsForTarget(target))
  }

  async getRuntimeGitCommitCompare(
    worktreeSelector: string,
    commitId: string
  ): Promise<GitCommitCompareResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getCommitCompare(target.worktree.path, commitId, localGitOptionsForTarget(target))
  }

  async getRuntimeGitBranchDiff(
    worktreeSelector: string,
    compare: { mergeBase: string; headOid: string },
    filePath: string,
    oldPath?: string
  ): Promise<GitDiffResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getBranchDiff(
      target.worktree.path,
      {
        mergeBase: compare.mergeBase,
        headOid: compare.headOid,
        filePath: normalizeRuntimeGitRelativePath(filePath),
        oldPath: oldPath ? normalizeRuntimeGitRelativePath(oldPath) : undefined
      },
      localGitOptionsForTarget(target)
    )
  }

  async getRuntimeGitCommitDiff(
    worktreeSelector: string,
    args: { commitOid: string; parentOid?: string | null; filePath: string; oldPath?: string }
  ): Promise<GitDiffResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getCommitDiff(
      target.worktree.path,
      {
        commitOid: args.commitOid,
        parentOid: args.parentOid,
        filePath: normalizeRuntimeRelativePath(args.filePath),
        oldPath: args.oldPath ? normalizeRuntimeRelativePath(args.oldPath) : undefined
      },
      localGitOptionsForTarget(target)
    )
  }

  async getRuntimeGitRemoteFileUrl(
    worktreeSelector: string,
    relativePath: string,
    line: number
  ): Promise<string | null> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getRemoteFileUrl(
      target.worktree.path,
      normalizeRuntimeGitRelativePath(relativePath),
      line
    )
  }

  async getRuntimeGitRemoteCommitUrl(
    worktreeSelector: string,
    sha: string
  ): Promise<string | null> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getRemoteCommitUrl(target.worktree.path, sha)
  }
}
