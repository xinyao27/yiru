import type { DetectedWorktreeListResult, Repo } from '../../shared/types'
import { callRuntimeEnvironmentExistingRoute } from '../ipc/runtime-environment-existing-route'

export async function listSpoolPairedRuntimeWorktrees(
  userDataPath: string,
  environmentId: string,
  repo: Repo
): Promise<DetectedWorktreeListResult> {
  try {
    const response = await callRuntimeEnvironmentExistingRoute(
      userDataPath,
      environmentId,
      'worktree.detectedList',
      { repo: `id:${repo.id}` }
    )
    if (response.ok && isDetectedWorktreeListResult(response.result, repo.id)) {
      return response.result
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
