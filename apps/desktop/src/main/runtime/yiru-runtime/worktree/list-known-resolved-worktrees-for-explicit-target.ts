import { isPathInsideOrEqual } from '@yiru/workbench-model/platform'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { splitWorktreeIdForFilesystem } from '@yiru/workbench-model/workspace'
import { resolveLocalProjectRuntimesForRepos } from '~main/project-runtime-git-options'
import { mergeWorktree } from '~main/worktree/logic'
import { isFolderRepo } from '~shared/repo-kind'
import type { WorktreeLineage } from '~shared/types'

import {
  RESOLVED_WORKTREE_CACHE_TTL_MS,
  RESOLVED_WORKTREE_REPO_TIMEOUT_MS,
  withTimeout
} from '../model/runtime-limits'
import { getAgentLaunchPlatform } from '../model/terminal-startup'
import type { ResolvedWorktree, ResolvedWorktreeSnapshot } from '../model/worktree-resolution'
import { listRuntimeFolderWorkspaces } from '../model/worktree-storage'
import { RuntimeWorktreeResolveLineageCandidateForTaskId } from './resolve-lineage-candidate-for-task-id'

export abstract class RuntimeWorktreeListKnownResolvedWorktreesForExplicitTarget extends RuntimeWorktreeResolveLineageCandidateForTaskId {
  protected listKnownResolvedWorktreesForExplicitTarget(
    targetWorktreeId: string,
    targetWorktree: ResolvedWorktree | null
  ): ResolvedWorktree[] {
    if (!this.store || !targetWorktree) {
      return []
    }
    const target = splitWorktreeIdForFilesystem(targetWorktreeId)
    if (!target?.repoId || !target.worktreePath) {
      return []
    }
    const worktreeIds = new Set(
      Object.keys(this.store.getAllWorktreeMeta()).filter((worktreeId) => {
        const parsed = splitWorktreeIdForFilesystem(worktreeId)
        return (
          parsed?.repoId === target.repoId &&
          Boolean(parsed.worktreePath) &&
          (isPathInsideOrEqual(target.worktreePath, parsed.worktreePath) ||
            isPathInsideOrEqual(parsed.worktreePath, target.worktreePath))
        )
      })
    )
    worktreeIds.add(targetWorktreeId)

    const resolved: ResolvedWorktree[] = []
    for (const worktreeId of worktreeIds) {
      const worktree =
        worktreeId === targetWorktreeId
          ? targetWorktree
          : this.buildResolvedWorktreeFromId(worktreeId)
      if (worktree) {
        resolved.push(worktree)
      }
    }
    return resolved
  }

  protected async listResolvedWorktrees(): Promise<ResolvedWorktree[]> {
    return (await this.listResolvedWorktreeSnapshot()).worktrees
  }

  protected async listResolvedWorktreeSnapshot(): Promise<ResolvedWorktreeSnapshot> {
    if (!this.store) {
      return { worktrees: [], platformByRepoId: new Map() }
    }
    const now = Date.now()
    if (this.resolvedWorktreeCache && this.resolvedWorktreeCache.expiresAt > now) {
      return this.resolvedWorktreeCache
    }
    const generation = this.resolvedWorktreeGeneration
    if (this.resolvedWorktreeInFlight?.generation === generation) {
      return this.resolvedWorktreeInFlight.promise
    }

    const promise = this.computeResolvedWorktrees(generation)
    this.resolvedWorktreeInFlight = { generation, promise }
    try {
      return await promise
    } finally {
      if (this.resolvedWorktreeInFlight?.promise === promise) {
        this.resolvedWorktreeInFlight = null
      }
    }
  }

  protected async computeResolvedWorktrees(generation: number): Promise<ResolvedWorktreeSnapshot> {
    if (!this.store) {
      return { worktrees: [], platformByRepoId: new Map() }
    }
    const now = Date.now()
    const metaById = this.store.getAllWorktreeMeta() ?? {}
    const repos = this.store
      .getRepos()
      .filter((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
    const projectRuntimeByRepoId = resolveLocalProjectRuntimesForRepos(this.requireStore(), repos)
    const platformByRepoId = new Map(
      repos.map((repo) => [repo.id, getAgentLaunchPlatform(projectRuntimeByRepoId.get(repo.id))])
    )
    const perRepoWorktrees = await Promise.all(
      repos.map(async (repo) => {
        if (isFolderRepo(repo)) {
          return listRuntimeFolderWorkspaces(this.requireStore(), repo).map((worktree) => ({
            ...worktree,
            parentWorktreeId: null,
            childWorktreeIds: [],
            lineage: null,
            git: {
              path: worktree.path,
              head: worktree.head,
              branch: worktree.branch,
              isBare: worktree.isBare,
              isMainWorktree: worktree.isMainWorktree
            },
            displayName: worktree.displayName,
            comment: worktree.comment
          }))
        }
        // Why: mobile startup RPCs share this path. A slow repo scan should
        // degrade one repo's metadata, not block all terminal/session loading.
        const scan = await withTimeout(
          this.listRepoWorktreesForResolution(repo, projectRuntimeByRepoId),
          RESOLVED_WORKTREE_REPO_TIMEOUT_MS,
          { ok: false, worktrees: [] }
        )
        const gitWorktrees = scan.worktrees
        if (scan.ok) {
          this.pruneLineageForMissingRepoWorktrees(repo, gitWorktrees)
        }
        return gitWorktrees.map((gitWorktree) => {
          const worktreeId = `${repo.id}::${gitWorktree.path}`
          // Why: lineage validation needs a durable instance ID even when the
          // runtime sees a workspace before the renderer's discovery-stamp path.
          const existingMeta = metaById[worktreeId]
          const meta =
            existingMeta && existingMeta.instanceId
              ? existingMeta
              : this.store?.setWorktreeMeta(worktreeId, {})
          const merged = mergeWorktree(repo.id, gitWorktree, meta, repo.displayName)
          return {
            ...merged,
            parentWorktreeId: null,
            childWorktreeIds: [],
            lineage: null,
            git: {
              path: gitWorktree.path,
              head: gitWorktree.head,
              branch: gitWorktree.branch,
              isBare: gitWorktree.isBare,
              isMainWorktree: gitWorktree.isMainWorktree
            },
            displayName: merged.displayName,
            comment: merged.comment
          }
        })
      })
    )
    const worktrees = this.attachLineageToResolvedWorktrees(perRepoWorktrees.flat())
    // Why: terminal polling can be frequent, but git worktree state is still
    // allowed to change outside Yiru. A short TTL avoids shelling out on every
    // read without pretending the cache is authoritative for long.
    if (generation === this.resolvedWorktreeGeneration) {
      this.resolvedWorktreeCache = {
        worktrees,
        platformByRepoId,
        expiresAt: now + RESOLVED_WORKTREE_CACHE_TTL_MS
      }
    }
    return { worktrees, platformByRepoId }
  }

  protected attachLineageToResolvedWorktrees(worktrees: ResolvedWorktree[]): ResolvedWorktree[] {
    const lineageById = this.store?.getAllWorktreeLineage?.() ?? {}
    const worktreeById = new Map(worktrees.map((worktree) => [worktree.id, worktree]))
    const validLineageByChildId = new Map<string, WorktreeLineage>()
    const childIdsByParentId = new Map<string, string[]>()

    for (const [childId, lineage] of Object.entries(lineageById)) {
      const child = worktreeById.get(childId)
      const parent = worktreeById.get(lineage.parentWorktreeId)
      if (
        !child ||
        !parent ||
        child.instanceId !== lineage.worktreeInstanceId ||
        parent.instanceId !== lineage.parentWorktreeInstanceId
      ) {
        // Why: worktree IDs are path-derived. Instance checks keep replacement
        // checkouts from appearing as children of stale same-path lineage.
        continue
      }
      validLineageByChildId.set(childId, lineage)
      const children = childIdsByParentId.get(lineage.parentWorktreeId) ?? []
      children.push(childId)
      childIdsByParentId.set(lineage.parentWorktreeId, children)
    }

    return worktrees.map((worktree) => {
      const lineage = validLineageByChildId.get(worktree.id) ?? null
      return {
        ...worktree,
        parentWorktreeId: lineage?.parentWorktreeId ?? null,
        childWorktreeIds: childIdsByParentId.get(worktree.id) ?? [],
        lineage
      }
    })
  }
}
