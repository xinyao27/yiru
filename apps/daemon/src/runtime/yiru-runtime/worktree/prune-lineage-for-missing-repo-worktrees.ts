import { randomUUID } from 'node:crypto'

import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '@yiru/runtime-protocol/model/workspace'
import type { ProjectExecutionRuntimeResolution } from '@yiru/runtime-protocol/workbench/project-execution-runtime'
import type { GitWorktreeInfo, Repo } from '@yiru/runtime-protocol/workbench/types'
import {
  isWorkspaceKey,
  parseWorkspaceKey,
  worktreeWorkspaceKey
} from '@yiru/runtime-protocol/workbench/workspace/scope'
import {
  getLocalProjectWorktreeGitOptionsForRuntime,
  resolveLocalProjectRuntimeForRepo
} from '~main/project-runtime-git-options'
import { listRepoWorktrees } from '~main/projects/worktrees'

import type { ResolvedWorktree, RuntimeWorktreeScanResult } from '../model/worktree-resolution'
import { RuntimeWorktreeListKnownResolvedWorktreesForExplicitTarget } from './list-known-resolved-worktrees-for-explicit-target'

export abstract class RuntimeWorktreePruneLineageForMissingRepoWorktrees extends RuntimeWorktreeListKnownResolvedWorktreesForExplicitTarget {
  protected pruneLineageForMissingRepoWorktrees(repo: Repo, gitWorktrees: GitWorktreeInfo[]): void {
    const store = this.store
    if (
      !store ||
      typeof store.getAllWorktreeLineage !== 'function' ||
      typeof store.removeWorktreeLineage !== 'function'
    ) {
      return
    }
    const liveIds = new Set(gitWorktrees.map((worktree) => `${repo.id}::${worktree.path}`))
    const repoPrefix = `${repo.id}::`
    for (const childWorkspaceKey of Object.keys(store.getAllWorkspaceLineage?.() ?? {})) {
      const childScope = parseWorkspaceKey(childWorkspaceKey)
      if (
        childScope?.type === 'worktree' &&
        childScope.worktreeId.startsWith(repoPrefix) &&
        !liveIds.has(childScope.worktreeId)
      ) {
        if (isWorkspaceKey(childWorkspaceKey)) {
          store.removeWorkspaceLineage?.(childWorkspaceKey)
        }
      }
    }
    for (const [childId, lineage] of Object.entries(store.getAllWorktreeLineage())) {
      if (childId.startsWith(repoPrefix) && !liveIds.has(childId)) {
        // Why: runtime selector scans can be the only scan before a path is
        // reused. Once a successful scan proves the child is gone, stale
        // lineage must not survive into the replacement checkout.
        store.removeWorktreeLineage(childId)
        store.removeWorkspaceLineage?.(worktreeWorkspaceKey(childId))
      }
      if (
        lineage.parentWorktreeId.startsWith(repoPrefix) &&
        !liveIds.has(lineage.parentWorktreeId)
      ) {
        const parentMeta = store.getWorktreeMeta(lineage.parentWorktreeId)
        if (!parentMeta || parentMeta.instanceId === lineage.parentWorktreeInstanceId) {
          // Why: preserving child lineage powers the repair UI, but a missing
          // parent path only needs one fresh identity to keep same-path
          // replacement checkouts from validating old lineage.
          store.setWorktreeMeta(lineage.parentWorktreeId, { instanceId: randomUUID() })
        }
      }
    }
  }

  protected async listRepoWorktreesForResolution(
    repo: Repo,
    projectRuntimeByRepoId?: ReadonlyMap<string, ProjectExecutionRuntimeResolution>
  ): Promise<RuntimeWorktreeScanResult> {
    if (getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
      // Why: paired-runtime worktree metadata contains paths from another machine.
      // Local selectors must fail closed instead of treating those paths as local IO targets.
      return { ok: false, worktrees: [] }
    }
    const projectRuntime = projectRuntimeByRepoId
      ? projectRuntimeByRepoId.get(repo.id)
      : resolveLocalProjectRuntimeForRepo(this.requireStore(), repo)
    return {
      ok: true,
      worktrees: await listRepoWorktrees(
        repo,
        getLocalProjectWorktreeGitOptionsForRuntime(repo, projectRuntime)
      )
    }
  }

  protected async getResolvedWorktreeMap(): Promise<Map<string, ResolvedWorktree>> {
    return new Map((await this.listResolvedWorktrees()).map((worktree) => [worktree.id, worktree]))
  }

  protected invalidateResolvedWorktreeCache(): void {
    this.resolvedWorktreeGeneration += 1
    this.resolvedWorktreeCache = null
  }

  /** Invalidate the worktree cache and tell the renderer to re-list, after an
   *  out-of-band branch change (e.g. auto-rename-from-work) so the new branch
   *  name surfaces without waiting for the next ambient refresh. */

  notifyBranchRenamed(repoId: string): void {
    this.invalidateResolvedWorktreeCache()
    this.notifyWorktreesChanged(repoId)
  }

  /** Like {@link notifyBranchRenamed}, but carries the old->new worktree id so the
   *  renderer re-keys its worktree-scoped state instead of treating the id change
   *  (from a folder rename) as a deletion. Same channel = guaranteed ordering. */

  notifyWorktreeFolderRenamed(repoId: string, oldWorktreeId: string, newWorktreeId: string): void {
    this.invalidateResolvedWorktreeCache()
    // Mirror notifyBranchRenamed so in-process onClientEvent listeners also see the rename.
    this.emitClientEvent({
      type: 'worktreesChanged',
      repoId,
      renamed: { oldWorktreeId, newWorktreeId }
    })
  }

  notifyFolderWorkspaceChanged(): void {
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
  }
}
