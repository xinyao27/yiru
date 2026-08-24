import { listWorktreesStrict } from '~main/git/worktree'
import { getLocalProjectWorktreeGitOptions } from '~main/project-runtime-git-options'
import { killAllProcessesForWorktree } from '~main/runtime/worktree-teardown'
import { findRegisteredDeletableWorktree } from '~main/worktree-removal-safety'
import { isFolderRepo } from '~shared/repo-kind'
import type { RemoveWorktreeResult } from '~shared/types'

import type { ManagedWorktreeRemovalContext } from '../model/managed-worktree-removal'
import {
  findLocalRepoById,
  getRuntimeFolderWorkspaceRootId,
  getRuntimeWorktreeRemovalOptionsKey
} from '../model/worktree-storage'
import { RuntimeCompositionRemoveRegisteredWorktree } from './remove-registered-worktree'

export abstract class RuntimeCompositionRemoveManagedWorktree extends RuntimeCompositionRemoveRegisteredWorktree {
  async removeManagedWorktree(
    worktreeSelector: string,
    force = false,
    runHooks = false
  ): Promise<RemoveWorktreeResult & { warning?: string }> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const store = this.store
    const removalTarget = await this.resolveWorktreeRemovalTarget(worktreeSelector)
    const optionsKey = getRuntimeWorktreeRemovalOptionsKey(force, runHooks)
    const inFlightRemoval = this.removeManagedWorktreeInFlight.get(removalTarget.id)
    if (inFlightRemoval) {
      if (inFlightRemoval.optionsKey === optionsKey) {
        return inFlightRemoval.promise
      }
      throw new Error(`Worktree deletion already in progress: ${removalTarget.id}`)
    }

    // Why: runtime callers can race the same workspace through CLI/mobile
    // retries. Share one destructive operation per worktree identity.
    const removal = (async (): Promise<RemoveWorktreeResult & { warning?: string }> => {
      const repo = findLocalRepoById(store, removalTarget.repoId)
      if (!repo) {
        throw new Error('repo_not_found')
      }
      if (isFolderRepo(repo)) {
        return this.removeFolderWorkspace(removalTarget.id, repo.id)
      }
      const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
      const hasLocalWorktreeGitOptions = Object.keys(localWorktreeGitOptions).length > 0
      const registeredWorktrees = hasLocalWorktreeGitOptions
        ? await listWorktreesStrict(repo.path, localWorktreeGitOptions)
        : await listWorktreesStrict(repo.path)
      const removedMeta = store.getWorktreeMeta(removalTarget.id)
      const context: ManagedWorktreeRemovalContext = {
        store,
        repo,
        removalTarget,
        force,
        runHooks,
        localWorktreeGitOptions,
        hasLocalWorktreeGitOptions,
        registeredWorktrees,
        removedMeta,
        removedPushTarget: removedMeta?.pushTarget ?? removalTarget.pushTarget
      }
      const registeredWorktree = findRegisteredDeletableWorktree(
        repo.path,
        removalTarget.path,
        registeredWorktrees
      )
      return registeredWorktree
        ? this.removeRegisteredManagedWorktree(context, registeredWorktree)
        : this.removeUnregisteredManagedWorktree(context)
    })()
    this.removeManagedWorktreeInFlight.set(removalTarget.id, { optionsKey, promise: removal })
    try {
      return await removal
    } finally {
      if (this.removeManagedWorktreeInFlight.get(removalTarget.id)?.promise === removal) {
        this.removeManagedWorktreeInFlight.delete(removalTarget.id)
      }
    }
  }

  private async removeFolderWorkspace(
    worktreeId: string,
    repoId: string
  ): Promise<RemoveWorktreeResult> {
    const store = this.requireStore()
    const repo = findLocalRepoById(store, repoId)
    if (!repo) {
      throw new Error('repo_not_found')
    }
    if (worktreeId === getRuntimeFolderWorkspaceRootId(repo)) {
      throw new Error(
        'Cannot delete the project root workspace. Remove the folder project instead.'
      )
    }
    const localProvider = this.getLocalProvider()
    if (localProvider) {
      await killAllProcessesForWorktree(worktreeId, {
        runtime: this,
        localProvider,
        onPtyStopped: this.onPtyStopped ?? undefined
      }).catch((error: unknown) => {
        console.warn(`[worktree-teardown] failed for ${worktreeId}:`, error)
      })
    }
    this.removeWorktreeMetadataAndHistory(store, worktreeId)
    this.preservedBranchCleanupByWorktreeId.delete(worktreeId)
    this.invalidateResolvedWorktreeCache()
    this.notifyWorktreesChanged(repo.id)
    return {}
  }
}
