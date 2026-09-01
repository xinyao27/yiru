import type { Repo } from '@yiru/runtime-protocol/workbench/types'
import {
  projectCatalogRepoKey,
  projectCatalogTargetForRepo,
  type ProjectCatalog
} from '~renderer/project-catalog/query'
import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import { targetKey } from '~renderer/runtime/query-target'

export type CommandPaletteRuntimeTarget = {
  key: string
  target: RuntimeClientTarget
}

export function commandPaletteRuntimeTargets(
  repos: readonly Repo[]
): CommandPaletteRuntimeTarget[] {
  const targets = new Map<string, RuntimeClientTarget>()
  for (const repo of repos) {
    const target = projectCatalogTargetForRepo(repo)
    targets.set(targetKey(target), target)
  }
  return [...targets].map(([key, target]) => ({ key, target }))
}

export function commandPaletteWorktreeTarget(
  catalog: ProjectCatalog,
  worktreeId: string | null
): RuntimeClientTarget | null {
  if (!worktreeId) {
    return null
  }
  for (const repo of catalog.repos) {
    const worktrees = catalog.worktreesByRepo[projectCatalogRepoKey(repo)] ?? []
    if (worktrees.some((worktree) => worktree.id === worktreeId)) {
      return projectCatalogTargetForRepo(repo)
    }
  }
  return null
}
