import { readBranchRenameFailureOutputForDisplay } from '~main/agent-hooks/branch-rename-failure-output'
import { gitExecFileAsync } from '~main/git/runner'
import { forceDeleteLocalBranch } from '~main/git/worktree'
import { getLocalProjectWorktreeGitOptions } from '~main/project-runtime-git-options'
import { cleanupUnusedWorktreePushTargetRemote } from '~main/worktree/remote'
import { isFolderRepo } from '~shared/repo-kind'
import type { ForceDeleteWorktreeBranchResult } from '~shared/types'

import { parseExactWorktreeIdSelector } from '../model/review-branch'
import { findLocalRepoById } from '../model/worktree-storage'
import { RuntimeWorktreeResolveGitLabProjectRemote } from './resolve-git-lab-project-remote'

export abstract class RuntimeWorktreeForceDeletePreservedBranch extends RuntimeWorktreeResolveGitLabProjectRemote {
  async forceDeletePreservedBranch(
    worktreeSelector: string,
    branchName: string,
    expectedHead: string
  ): Promise<ForceDeleteWorktreeBranchResult> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const removalTarget = parseExactWorktreeIdSelector(worktreeSelector)
    const cleanupTarget = removalTarget
      ? this.preservedBranchCleanupByWorktreeId.get(removalTarget.id)
      : undefined
    if (
      !removalTarget ||
      !cleanupTarget ||
      cleanupTarget.branchName !== branchName ||
      cleanupTarget.head !== expectedHead
    ) {
      throw new Error(`No preserved branch cleanup is pending for "${branchName}".`)
    }

    const repo = findLocalRepoById(this.store, removalTarget.repoId)
    if (!repo) {
      throw new Error('repo_not_found')
    }
    if (isFolderRepo(repo)) {
      throw new Error('Folder workspaces do not have local Git branches.')
    }

    const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    await (Object.keys(localWorktreeGitOptions).length > 0
      ? forceDeleteLocalBranch(
          repo.path,
          cleanupTarget.branchName,
          cleanupTarget.head,
          (argv, cwd) => gitExecFileAsync(argv, { cwd, ...localWorktreeGitOptions })
        )
      : forceDeleteLocalBranch(repo.path, cleanupTarget.branchName, cleanupTarget.head))
    await cleanupUnusedWorktreePushTargetRemote(
      repo.path,
      removalTarget.id,
      cleanupTarget.pushTarget,
      this.store,
      localWorktreeGitOptions
    )

    this.preservedBranchCleanupByWorktreeId.delete(removalTarget.id)
    return { deleted: true }
  }

  // Why: the failure output lives in main-memory module state keyed by the
  // canonical worktree id (see main/agent-hooks/branch-rename-failure-output.ts),
  // not on the store — resolve the selector first so callers can use any
  // selector form, not just a raw id.

  async getBranchRenameFailureOutputForWorktree(worktreeSelector: string): Promise<string | null> {
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    return readBranchRenameFailureOutputForDisplay(worktree.id)
  }
}
