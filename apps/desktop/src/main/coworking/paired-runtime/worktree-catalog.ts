import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
import { callRuntimeEnvironmentExistingRoute } from '~main/runtime/environment-existing-route'
import { CoworkingPairedRuntimeWorktreeCatalogSchema } from '~shared/coworking/paired-runtime-result-contract'
import type { DetectedWorktreeListResult, Repo } from '~shared/types'

import { withCoworkingOuterActualHostScope } from '../canonical-host-path'

export type CoworkingPairedRuntimeWorktreeCatalog = {
  inventory: DetectedWorktreeListResult
  actualHostScope: string
}

export async function listCoworkingPairedRuntimeWorktrees(
  userDataPath: string,
  environmentId: string,
  repo: Repo
): Promise<CoworkingPairedRuntimeWorktreeCatalog> {
  try {
    const response = await callRuntimeEnvironmentExistingRoute(
      userDataPath,
      environmentId,
      'coworking.host.listWorktrees',
      { repoId: repo.id }
    )
    const result = response.ok
      ? CoworkingPairedRuntimeWorktreeCatalogSchema.safeParse(response.result)
      : null
    if (result?.success && isDetectedWorktreeListResult(result.data.inventory, repo.id)) {
      return {
        inventory: result.data.inventory,
        actualHostScope: withCoworkingOuterActualHostScope(
          getRepoExecutionHostId(repo),
          result.data.actualHostScope
        )
      }
    }
  } catch {
    // Why: the owner catalog exposes only availability, never paired transport details.
  }
  throw new Error('coworking_runtime_worktree_catalog_unavailable')
}

function isDetectedWorktreeListResult(
  value: unknown,
  repoId: string
): value is DetectedWorktreeListResult {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.repoId === repoId &&
    typeof record.authoritative === 'boolean' &&
    typeof record.source === 'string' &&
    Array.isArray(record.worktrees) &&
    record.worktrees.every(
      (worktree) =>
        worktree !== null &&
        typeof worktree === 'object' &&
        typeof (worktree as Record<string, unknown>).id === 'string' &&
        (worktree as Record<string, unknown>).repoId === repoId &&
        typeof (worktree as Record<string, unknown>).path === 'string'
    )
  )
}
