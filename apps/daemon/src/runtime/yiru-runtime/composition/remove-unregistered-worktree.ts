import type { RemoveWorktreeResult } from '@yiru/runtime-protocol/workbench/types'
import { invalidateAuthorizedRootsCache } from '~main/filesystem/auth'
import {
  getLocalWorktreePathAccess,
  removeLocalWorktreePath,
  toLocalWorktreeRuntimePath
} from '~main/worktree/filesystem'
import { cleanupUnusedWorktreePushTargetRemote } from '~main/worktree/remote'
import {
  assertWorktreeDoesNotContainRegisteredWorktree,
  canCleanupUnregisteredYiruLeftoverDirectory,
  canCleanupUnregisteredYiruWorktreeDirectory,
  canSafelyRemoveOrphanedWorktreeDirectory,
  isDangerousWorktreeRemovalPath,
  ORPHANED_WORKTREE_DIRECTORY_MESSAGE,
  UNREGISTERED_MISSING_WORKTREE_MESSAGE
} from '~main/worktree/removal-safety'

import type { ManagedWorktreeRemovalContext } from '../model/managed-worktree-removal'
import {
  isLocalRuntimeGitRepository,
  isRuntimeWorktreePathMissing
} from '../model/worktree-storage'
import { RuntimeCompositionStopPtysForDestructiveWorktreeRemoval } from './stop-ptys-for-destructive-worktree-removal'

export abstract class RuntimeCompositionRemoveUnregisteredWorktree extends RuntimeCompositionStopPtysForDestructiveWorktreeRemoval {
  protected async removeUnregisteredManagedWorktree(
    context: ManagedWorktreeRemovalContext
  ): Promise<RemoveWorktreeResult & { warning?: string }> {
    const {
      force,
      localWorktreeGitOptions,
      registeredWorktrees,
      removalTarget,
      removedMeta,
      removedPushTarget,
      repo,
      store
    } = context
    let canCleanOrphanedDirectory = false
    if (canCleanupUnregisteredYiruWorktreeDirectory({ meta: removedMeta })) {
      const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
      canCleanOrphanedDirectory =
        !isDangerousWorktreeRemovalPath(removalTarget.path, repo.path) &&
        (await canSafelyRemoveOrphanedWorktreeDirectory(
          toLocalWorktreeRuntimePath(removalTarget.path, localWorktreeGitOptions),
          toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
          access.statPath,
          access.readPath
        ))
    }
    if (canCleanOrphanedDirectory) {
      assertWorktreeDoesNotContainRegisteredWorktree(removalTarget.path, registeredWorktrees)
      if (!force) {
        throw new Error(ORPHANED_WORKTREE_DIRECTORY_MESSAGE)
      }
      await this.removeOrphanedWorktreeDirectory(context)
      return {}
    }

    const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
    const runtimeWorktreePath = toLocalWorktreeRuntimePath(
      removalTarget.path,
      localWorktreeGitOptions
    )
    if (
      await canCleanupUnregisteredYiruLeftoverDirectory({
        meta: removedMeta,
        worktreePath: removalTarget.path,
        runtimeWorktreePath,
        repo,
        runtimeRepoPath: toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
        registeredWorktrees,
        statPath: access.statPath,
        isGitRepository: (path) => isLocalRuntimeGitRepository(path, localWorktreeGitOptions)
      })
    ) {
      if (!force) {
        throw new Error(ORPHANED_WORKTREE_DIRECTORY_MESSAGE)
      }
      await this.removeOrphanedWorktreeDirectory(context)
      return {}
    }
    if (await isRuntimeWorktreePathMissing(removalTarget.path, localWorktreeGitOptions)) {
      if (!force && !removedMeta) {
        // Why: without persisted metadata, require the renderer recovery path
        // before deleting Yiru-only state for an unregistered path.
        throw new Error(UNREGISTERED_MISSING_WORKTREE_MESSAGE)
      }
      await cleanupUnusedWorktreePushTargetRemote(
        repo.path,
        removalTarget.id,
        removedPushTarget,
        store,
        localWorktreeGitOptions
      )
      this.finishManagedWorktreeRemoval(context)
      return {}
    }
    throw new Error(`Refusing to delete unregistered worktree path: ${removalTarget.path}`)
  }

  private async removeOrphanedWorktreeDirectory(
    context: ManagedWorktreeRemovalContext
  ): Promise<void> {
    const { localWorktreeGitOptions, removalTarget, removedPushTarget, repo, store } = context
    const removalGate = await this.acquireFileWatcherRemoval(removalTarget.path)
    let removalCompleted = false
    try {
      await this.stopPtysForDestructiveWorktreeRemoval(removalTarget.id)
      await removeLocalWorktreePath(removalTarget.path, localWorktreeGitOptions)
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
    this.finishManagedWorktreeRemoval(context)
  }

  protected finishManagedWorktreeRemoval(context: ManagedWorktreeRemovalContext): void {
    this.clearOptimisticReconcileToken(context.removalTarget.id)
    this.removeWorktreeMetadataAndHistory(context.store, context.removalTarget.id)
    this.preservedBranchCleanupByWorktreeId.delete(context.removalTarget.id)
    this.invalidateResolvedWorktreeCache()
    invalidateAuthorizedRootsCache()
    this.notifyWorktreesChanged(context.repo.id)
  }
}
