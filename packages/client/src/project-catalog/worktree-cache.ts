import type { RuntimeDetectedWorktreeListResult } from '@yiru/runtime-protocol/contract'
import { getRuntimeTargetOrpc } from '~renderer/runtime/query-target'

import { readProjectCatalogQueryClient, readProjectCatalogSnapshot } from './catalog-snapshot'
import { projectCatalogRepoKey, projectCatalogTargetForRepo } from './query'

type CachedWorktree = RuntimeDetectedWorktreeListResult['worktrees'][number]

export function readProjectCatalogWorktree(worktreeId: string): CachedWorktree | undefined {
  const owner = findWorktreeOwner(worktreeId)
  if (!owner) {
    return undefined
  }
  return readProjectCatalogQueryClient()
    .getQueryData<RuntimeDetectedWorktreeListResult>(owner.queryKey)
    ?.worktrees.find((worktree) => worktree.id === worktreeId)
}

export function updateProjectCatalogWorktree(
  worktreeId: string,
  updates: Partial<RuntimeDetectedWorktreeListResult['worktrees'][number]>
): boolean {
  const owner = findWorktreeOwner(worktreeId)
  if (!owner) {
    return false
  }
  let changed = false
  readProjectCatalogQueryClient().setQueryData<RuntimeDetectedWorktreeListResult>(
    owner.queryKey,
    (current) => {
      if (!current) {
        return current
      }
      const worktrees = current.worktrees.map((worktree) => {
        if (worktree.id !== worktreeId) {
          return worktree
        }
        changed = true
        return { ...worktree, ...updates }
      })
      return changed ? { ...current, worktrees } : current
    }
  )
  return changed
}

function findWorktreeOwner(worktreeId: string): { queryKey: readonly unknown[] } | null {
  const catalog = readProjectCatalogSnapshot()
  const repo = catalog.repos.find((candidate) =>
    catalog.detectedWorktreesByRepo[projectCatalogRepoKey(candidate)]?.worktrees.some(
      (worktree) => worktree.id === worktreeId
    )
  )
  if (!repo) {
    return null
  }
  const target = projectCatalogTargetForRepo(repo)
  return {
    queryKey: getRuntimeTargetOrpc(target).worktree.detectedList.queryKey({
      input: { repo: repo.id }
    })
  }
}
