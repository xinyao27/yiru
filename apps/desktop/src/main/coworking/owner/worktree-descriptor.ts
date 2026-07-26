import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'

import type { Store } from '../../persistence'
import type { CoworkingOwnerWorktreeDescriptor } from './service-options'

// Why: the owner catalog and the RPC layer both display a worktree by project
// and repo name, never its filesystem path — this is the one place that
// derives that display identity from the store.
export function resolveCoworkingOwnerWorktreeDescriptor(
  store: Store,
  worktreeId: string
): CoworkingOwnerWorktreeDescriptor | null {
  const meta = store.getWorktreeMeta(worktreeId)
  const repo = store.getRepo(getRepoIdFromWorktreeId(worktreeId))
  if (!meta || !repo) {
    return null
  }
  const projectId = meta.projectId ?? null
  const project = projectId
    ? store.getProjects().find((candidate) => candidate.id === projectId)
    : null
  return {
    displayName: meta.displayName,
    projectId,
    projectDisplayName: project?.displayName ?? repo.displayName
  }
}
