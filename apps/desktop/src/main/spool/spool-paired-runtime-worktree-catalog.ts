import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'

import { SpoolPairedRuntimeWorktreeCatalogSchema } from '../../shared/spool/spool-paired-runtime-result-contract'
import type { DetectedWorktreeListResult, Repo } from '../../shared/types'
import { callRuntimeEnvironmentExistingRoute } from '../ipc/runtime-environment-existing-route'
import { withSpoolOuterActualHostScope } from './spool-canonical-host-path'

export type SpoolPairedRuntimeWorktreeCatalog = {
  inventory: DetectedWorktreeListResult
  actualHostScope: string
}

export async function listSpoolPairedRuntimeWorktrees(
  userDataPath: string,
  environmentId: string,
  repo: Repo
): Promise<SpoolPairedRuntimeWorktreeCatalog> {
  try {
    const response = await callRuntimeEnvironmentExistingRoute(
      userDataPath,
      environmentId,
      'spool.host.listWorktrees',
      { repoId: repo.id }
    )
    const result = response.ok
      ? SpoolPairedRuntimeWorktreeCatalogSchema.safeParse(response.result)
      : null
    if (result?.success && isDetectedWorktreeListResult(result.data.inventory, repo.id)) {
      return {
        inventory: result.data.inventory,
        actualHostScope: withSpoolOuterActualHostScope(
          getRepoExecutionHostId(repo),
          result.data.actualHostScope
        )
      }
    }
  } catch {
    // Why: the owner catalog exposes only availability, never paired transport details.
  }
  throw new Error('spool_runtime_worktree_catalog_unavailable')
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
