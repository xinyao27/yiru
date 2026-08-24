import { isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'
import { invalidateAuthorizedRootsCache } from '~main/filesystem/auth'
import { gitExecFileAsync } from '~main/git/runner'
import {
  assertWorktreeCleanForRemoval,
  listWorktreesStrict,
  removeWorktree
} from '~main/git/worktree'
import { getEffectiveHooks, runHook } from '~main/hooks'
import {
  getLocalWorktreePathAccess,
  removeLocalWorktreePath,
  toLocalWorktreeRuntimePath
} from '~main/local-worktree-filesystem'
import {
  recoverLocalWindowsWorktreeRemoval,
  removeStaleLocalWorktreeRegistrationAfterFilesystemRemoval
} from '~main/local-worktree-removal-recovery'
import {
  canSafelyRemoveOrphanedWorktreeDirectory,
  findRegisteredDeletableWorktree
} from '~main/worktree-removal-safety'
import {
  formatWorktreeRemovalError,
  isOrphanCompatiblePreflightError,
  isOrphanedWorktreeError
} from '~main/worktree/logic'
import { cleanupUnusedWorktreePushTargetRemote } from '~main/worktree/remote'
import { getWorktreeSharedLinkPaths } from '~main/worktree/shared-directories'
import {
  findExistingWorktreeSymlinkPaths,
  removeWorktreeLinkedPaths
} from '~main/worktree/symlinks'
import type { RemoveWorktreeResult } from '~shared/types'
import { assertWorktreeUnlockedForRemoval } from '~shared/workspace/worktree-removal'
import type { GitWorktreeInfo } from '~shared/worktree-types'

import type { ManagedWorktreeRemovalContext } from '../model/managed-worktree-removal'
import { isRuntimeWorktreePathMissing } from '../model/worktree-storage'
import { RuntimeCompositionRemoveUnregisteredWorktree } from './remove-unregistered-worktree'

export abstract class RuntimeCompositionRemoveRegisteredWorktree extends RuntimeCompositionRemoveUnregisteredWorktree {
  protected async removeRegisteredManagedWorktree(
    context: ManagedWorktreeRemovalContext,
    registeredWorktree: GitWorktreeInfo
  ): Promise<RemoveWorktreeResult & { warning?: string }> {
    const {
      force,
      hasLocalWorktreeGitOptions,
      localWorktreeGitOptions,
      removalTarget,
      removedMeta,
      removedPushTarget,
      repo,
      runHooks,
      store
    } = context
    const canonicalWorktreePath = registeredWorktree.path
    const deleteBranch = removedMeta?.preserveBranchOnDelete !== true
    try {
      assertWorktreeUnlockedForRemoval(registeredWorktree)
    } catch (error) {
      throw new Error(formatWorktreeRemovalError(error, canonicalWorktreePath, force))
    }

    if (
      force &&
      process.platform === 'win32' &&
      (isWindowsAbsolutePathLike(canonicalWorktreePath) || !!localWorktreeGitOptions.wslDistro) &&
      removedMeta &&
      (await isRuntimeWorktreePathMissing(canonicalWorktreePath, localWorktreeGitOptions))
    ) {
      const result = await removeStaleLocalWorktreeRegistrationAfterFilesystemRemoval({
        canonicalWorktreePath,
        repoPath: repo.path,
        localWorktreeGitOptions,
        registeredWorktree,
        deleteBranch
      })
      await cleanupUnusedWorktreePushTargetRemote(
        repo.path,
        removalTarget.id,
        removedPushTarget,
        store,
        localWorktreeGitOptions
      )
      this.rememberPreservedBranchCleanupTarget(
        removalTarget.id,
        result,
        registeredWorktree.head,
        removedPushTarget
      )
      this.clearOptimisticReconcileToken(removalTarget.id)
      this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
      this.invalidateResolvedWorktreeCache()
      invalidateAuthorizedRootsCache()
      this.notifyWorktreesChanged(repo.id)
      return result ?? {}
    }

    const hooks = getEffectiveHooks(repo)
    let warning: string | undefined
    if (hooks?.scripts.archive && runHooks) {
      const result = await runHook(
        'archive',
        canonicalWorktreePath,
        repo,
        undefined,
        hasLocalWorktreeGitOptions ? localWorktreeGitOptions : undefined
      )
      if (!result.success) {
        console.error(`[hooks] archive hook failed for ${canonicalWorktreePath}:`, result.output)
      }
    } else if (hooks?.scripts.archive) {
      warning = `yiru.yaml archive hook skipped for ${canonicalWorktreePath}; pass --run-hooks to run it.`
      console.warn(`[hooks] ${warning}`)
    }

    const refreshedWorktrees = hasLocalWorktreeGitOptions
      ? await listWorktreesStrict(repo.path, localWorktreeGitOptions)
      : await listWorktreesStrict(repo.path)
    const refreshedRegisteredWorktree = findRegisteredDeletableWorktree(
      repo.path,
      canonicalWorktreePath,
      refreshedWorktrees
    )
    if (!refreshedRegisteredWorktree) {
      throw new Error(
        `Worktree registration changed during deletion: ${canonicalWorktreePath}. Retry deletion.`
      )
    }
    try {
      assertWorktreeUnlockedForRemoval(refreshedRegisteredWorktree)
    } catch (error) {
      throw new Error(formatWorktreeRemovalError(error, canonicalWorktreePath, force))
    }

    const linkedPaths = getWorktreeSharedLinkPaths(repo)
    const ignoredLinkedPaths = force
      ? []
      : await findExistingWorktreeSymlinkPaths(canonicalWorktreePath, linkedPaths)
    try {
      await (hasLocalWorktreeGitOptions
        ? assertWorktreeCleanForRemoval(canonicalWorktreePath, force, {
            ...localWorktreeGitOptions,
            ...(ignoredLinkedPaths.length > 0 ? { ignoredUntrackedPaths: ignoredLinkedPaths } : {})
          })
        : ignoredLinkedPaths.length > 0
          ? assertWorktreeCleanForRemoval(canonicalWorktreePath, force, {
              ignoredUntrackedPaths: ignoredLinkedPaths
            })
          : assertWorktreeCleanForRemoval(canonicalWorktreePath, force))
    } catch (error) {
      if (!isOrphanCompatiblePreflightError(error)) {
        throw new Error(formatWorktreeRemovalError(error, canonicalWorktreePath, force))
      }
    }

    let removalResult: RemoveWorktreeResult | undefined
    const removalGate = await this.acquireFileWatcherRemoval(canonicalWorktreePath)
    let removalCompleted = false
    try {
      await this.stopPtysForDestructiveWorktreeRemoval(removalTarget.id)
      if (linkedPaths.length > 0) {
        await removeWorktreeLinkedPaths(canonicalWorktreePath, linkedPaths)
      }
      try {
        removalResult = this.preserveBranchHeadFallback(
          await removeWorktree(repo.path, canonicalWorktreePath, force, {
            ...(!deleteBranch ? { deleteBranch } : {}),
            knownRemovedWorktree: refreshedRegisteredWorktree,
            ...localWorktreeGitOptions
          }),
          refreshedRegisteredWorktree.head
        )
      } catch (error) {
        const recovered = await recoverLocalWindowsWorktreeRemoval({
          error,
          force,
          canonicalWorktreePath,
          repoPath: repo.path,
          localWorktreeGitOptions,
          registeredWorktree: refreshedRegisteredWorktree,
          deleteBranch,
          closeWatcher: (worktreePath) => this.closeFileWatchersForRemoval(worktreePath)
        })
        if (recovered) {
          removalResult = recovered
          removalCompleted = true
        } else if (isOrphanedWorktreeError(error)) {
          await this.cleanupOrphanedRegisteredWorktree(context, canonicalWorktreePath)
          removalCompleted = true
          return warning ? { warning } : {}
        } else {
          throw new Error(formatWorktreeRemovalError(error, canonicalWorktreePath, force))
        }
      }
      removalCompleted = true
    } finally {
      await removalGate.finish(removalCompleted)
    }

    await cleanupUnusedWorktreePushTargetRemote(
      repo.path,
      removalTarget.id,
      removedPushTarget,
      store,
      localWorktreeGitOptions
    )
    this.rememberPreservedBranchCleanupTarget(
      removalTarget.id,
      removalResult,
      refreshedRegisteredWorktree.head,
      removedPushTarget
    )
    this.clearOptimisticReconcileToken(removalTarget.id)
    this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
    this.invalidateResolvedWorktreeCache()
    invalidateAuthorizedRootsCache()
    this.notifyWorktreesChanged(repo.id)
    return { ...removalResult, ...(warning ? { warning } : {}) }
  }

  private async cleanupOrphanedRegisteredWorktree(
    context: ManagedWorktreeRemovalContext,
    canonicalWorktreePath: string
  ): Promise<void> {
    const { localWorktreeGitOptions, removalTarget, removedPushTarget, repo, store } = context
    const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
    if (
      await canSafelyRemoveOrphanedWorktreeDirectory(
        toLocalWorktreeRuntimePath(canonicalWorktreePath, localWorktreeGitOptions),
        toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
        access.statPath,
        access.readPath
      )
    ) {
      await this.closeFileWatchersForRemoval(canonicalWorktreePath)
      await removeLocalWorktreePath(canonicalWorktreePath, localWorktreeGitOptions).catch(() => {})
    } else {
      console.warn(
        `[worktrees] Refusing recursive cleanup for unproven worktree directory: ${canonicalWorktreePath}`
      )
    }
    await gitExecFileAsync(['worktree', 'prune'], {
      cwd: repo.path,
      ...localWorktreeGitOptions
    }).catch(() => {})
    await cleanupUnusedWorktreePushTargetRemote(
      repo.path,
      removalTarget.id,
      removedPushTarget,
      store,
      localWorktreeGitOptions
    )
    this.finishManagedWorktreeRemoval(context)
  }
}
