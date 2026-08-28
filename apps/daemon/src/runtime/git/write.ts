import type {
  GitAddTagResult,
  GitCheckoutCommitResult,
  GitCherryPickResult,
  GitCreateBranchResult,
  GitDropCommitResult,
  GitMergeCommitResult,
  GitRebaseOntoCommitResult,
  GitResetToCommitResult,
  GitRevertResult
} from '@yiru/runtime-protocol/workbench/git/write-op-results'
import type { RuntimeGitCheckoutResult } from '@yiru/runtime-protocol/workbench/runtime-types'
import { createBranchFromCommit } from '~main/git/repo/branch-create'
import { checkoutBranch } from '~main/git/repo/checkout'
import { checkoutCommit } from '~main/git/repo/checkout-commit'
import { cherryPickCommit } from '~main/git/repo/cherry-pick'
import { dropCommit } from '~main/git/repo/drop-commit'
import { mergeCommit } from '~main/git/repo/merge-commit'
import { rebaseOntoCommit } from '~main/git/repo/rebase-onto-commit'
import { resetToCommit } from '~main/git/repo/reset-to-commit'
import { revertCommit } from '~main/git/repo/revert'
import { addTag } from '~main/git/repo/tag'
import { appendFolderToGitignore } from '~main/git/status/huge-folder-ignore'
import {
  abortMerge,
  abortRebase,
  abortRevert,
  bulkDiscardChanges,
  bulkStageFiles,
  bulkUnstageFiles,
  commitChanges,
  discardChanges,
  stageFile,
  unstageFile
} from '~main/git/status/status'

import {
  admitRuntimeGitMutation,
  localGitOptionsForTarget,
  normalizeRuntimeGitRelativePath,
  type RuntimeGitMutationAdmission
} from './context'
import { RuntimeGitReadCommands } from './read'

export class RuntimeGitWriteCommands extends RuntimeGitReadCommands {
  async appendRuntimeGitignore(worktreeSelector: string, folderName: string): Promise<boolean> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return appendFolderToGitignore(target.worktree.path, folderName)
  }

  async abortRuntimeGitMerge(worktreeSelector: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await abortMerge(target.worktree.path, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async abortRuntimeGitRebase(worktreeSelector: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await abortRebase(target.worktree.path, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async abortRuntimeGitRevert(worktreeSelector: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await abortRevert(target.worktree.path, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async checkoutRuntimeGitBranch(
    worktreeSelector: string,
    branch: string
  ): Promise<RuntimeGitCheckoutResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await checkoutBranch(target.worktree.path, branch, localGitOptionsForTarget(target))
    return { ok: true, branch }
  }

  async addRuntimeGitTag(
    worktreeSelector: string,
    params: { name: string; commit: string; message?: string; force?: boolean }
  ): Promise<GitAddTagResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return addTag(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async createRuntimeGitBranchFromCommit(
    worktreeSelector: string,
    params: { name: string; commit: string; checkout?: boolean }
  ): Promise<GitCreateBranchResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return createBranchFromCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async checkoutRuntimeGitCommit(
    worktreeSelector: string,
    commit: string
  ): Promise<GitCheckoutCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return checkoutCommit(target.worktree.path, commit, localGitOptionsForTarget(target))
  }

  async cherryPickRuntimeGitCommit(
    worktreeSelector: string,
    params: { commit: string; mainline?: number }
  ): Promise<GitCherryPickResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return cherryPickCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async revertRuntimeGitCommit(
    worktreeSelector: string,
    params: { commit: string; mainline?: number }
  ): Promise<GitRevertResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return revertCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async dropRuntimeGitCommit(
    worktreeSelector: string,
    params: { commit: string }
  ): Promise<GitDropCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return dropCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async mergeRuntimeGitCommit(
    worktreeSelector: string,
    params: { commit: string; noFf?: boolean; squash?: boolean; message?: string }
  ): Promise<GitMergeCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return mergeCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async rebaseRuntimeGitOntoCommit(
    worktreeSelector: string,
    params: { commit: string }
  ): Promise<GitRebaseOntoCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return rebaseOntoCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async resetRuntimeGitToCommit(
    worktreeSelector: string,
    params: { commit: string; mode: 'soft' | 'mixed' | 'hard' }
  ): Promise<GitResetToCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return resetToCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async commitRuntimeGit(
    worktreeSelector: string,
    message: string,
    admission?: RuntimeGitMutationAdmission
  ): Promise<{ success: boolean; error?: string }> {
    if (message.trim().length === 0) {
      throw new Error('Commit message is required')
    }
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await admitRuntimeGitMutation(admission)
    return commitChanges(target.worktree.path, message, {
      ...localGitOptionsForTarget(target),
      signal: admission?.signal
    })
  }

  async stageRuntimeGitPath(worktreeSelector: string, filePath: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await stageFile(
      target.worktree.path,
      normalizeRuntimeGitRelativePath(filePath),
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }

  async unstageRuntimeGitPath(worktreeSelector: string, filePath: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await unstageFile(
      target.worktree.path,
      normalizeRuntimeGitRelativePath(filePath),
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }

  async bulkStageRuntimeGitPaths(
    worktreeSelector: string,
    filePaths: string[],
    admission?: RuntimeGitMutationAdmission
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePaths = filePaths.map(normalizeRuntimeGitRelativePath)
    await admitRuntimeGitMutation(admission)
    await bulkStageFiles(target.worktree.path, relativePaths, {
      ...localGitOptionsForTarget(target),
      signal: admission?.signal
    })
    return { ok: true }
  }

  async bulkUnstageRuntimeGitPaths(
    worktreeSelector: string,
    filePaths: string[],
    admission?: RuntimeGitMutationAdmission
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePaths = filePaths.map(normalizeRuntimeGitRelativePath)
    await admitRuntimeGitMutation(admission)
    await bulkUnstageFiles(target.worktree.path, relativePaths, {
      ...localGitOptionsForTarget(target),
      signal: admission?.signal
    })
    return { ok: true }
  }

  async bulkDiscardRuntimeGitPaths(
    worktreeSelector: string,
    filePaths: string[]
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await bulkDiscardChanges(
      target.worktree.path,
      filePaths.map(normalizeRuntimeGitRelativePath),
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }

  async discardRuntimeGitPath(worktreeSelector: string, filePath: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await discardChanges(
      target.worktree.path,
      normalizeRuntimeGitRelativePath(filePath),
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }
}
