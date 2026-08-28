import type { QueryClient } from '@tanstack/react-query'
import type { PublicKnownRuntimeEnvironment } from '@yiru/runtime-protocol/workbench/runtime-environments'
import type {
  DetectedWorktreeListResult,
  Repo,
  Worktree,
  WorktreeLineage,
  WorkspaceLineage
} from '@yiru/runtime-protocol/workbench/types'
import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import { getRuntimeTargetOrpc } from '~renderer/runtime/query-target'

import {
  projectCatalogRepoForTarget,
  projectCatalogRepoKey,
  projectCatalogTargetForRepo
} from './query'
import { collectProjectCatalogWorktrees } from './worktree-assembly'

const LOCAL_TARGET = { kind: 'local' } as const satisfies RuntimeClientTarget

export type ProjectWorktreeCatalog = {
  detected: DetectedWorktreeListResult | undefined
  worktrees: Worktree[]
}

export async function refreshProjectCatalogTargetRepos(
  queryClient: QueryClient,
  target: RuntimeClientTarget
): Promise<Repo[]> {
  const result = await queryClient.fetchQuery({
    ...getRuntimeTargetOrpc(target).repo.list.queryOptions(),
    staleTime: 0
  })
  return result.repos.map((repo) => projectCatalogRepoForTarget(repo, target))
}

export async function invalidateProjectCatalogTarget(
  queryClient: QueryClient,
  target: RuntimeClientTarget
): Promise<void> {
  const orpc = getRuntimeTargetOrpc(target)
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.repo.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.projectGroup.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.folderWorkspace.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.project.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.projectHostSetup.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.worktree.key() })
  ])
}

export async function invalidateAllProjectCatalogTargets(queryClient: QueryClient): Promise<void> {
  const targets: RuntimeClientTarget[] = [
    LOCAL_TARGET,
    ...readRuntimeEnvironmentsFromQuery(queryClient).map((environment) => ({
      kind: 'environment' as const,
      environmentId: environment.id
    }))
  ]
  await Promise.all(targets.map((target) => invalidateProjectCatalogTarget(queryClient, target)))
}

function readRuntimeEnvironmentsFromQuery(
  queryClient: QueryClient
): PublicKnownRuntimeEnvironment[] {
  return (
    queryClient.getQueryData<PublicKnownRuntimeEnvironment[]>(
      getRuntimeTargetOrpc(LOCAL_TARGET).shell.runtimeEnvironments.list.queryKey()
    ) ?? []
  )
}

export async function refreshProjectCatalogWorktrees(
  queryClient: QueryClient,
  repo: Repo
): Promise<ProjectWorktreeCatalog> {
  const target = projectCatalogTargetForRepo(repo)
  const result = await queryClient.fetchQuery({
    ...getRuntimeTargetOrpc(target).worktree.detectedList.queryOptions({
      input: { repo: repo.id }
    }),
    staleTime: 0
  })
  const collected = collectProjectCatalogWorktrees([{ repo, target }], [{ data: result }])
  const key = projectCatalogRepoKey(repo)
  return {
    detected: collected.detectedWorktreesByRepo[key],
    worktrees: collected.worktreesByRepo[key] ?? []
  }
}

export async function refreshProjectCatalogLineage(
  queryClient: QueryClient,
  target: RuntimeClientTarget
): Promise<{
  workspaceLineageByChildKey: Record<string, WorkspaceLineage>
  worktreeLineageById: Record<string, WorktreeLineage>
}> {
  const result = await queryClient.fetchQuery({
    ...getRuntimeTargetOrpc(target).worktree.lineageList.queryOptions(),
    staleTime: 0
  })
  return {
    workspaceLineageByChildKey: result.workspaceLineage,
    worktreeLineageById: result.lineage
  }
}
