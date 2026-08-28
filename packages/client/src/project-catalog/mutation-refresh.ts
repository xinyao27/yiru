import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import { getRuntimeTargetOrpc } from '~renderer/runtime/query-target'

import {
  readProjectCatalogQueryClient,
  recordProjectCatalogMutationRevision,
  recordWorktreeMutationRevision
} from './catalog-snapshot'
import { invalidateProjectCatalogTarget } from './refresh'

export async function refreshAfterProjectCatalogMutation(
  target: RuntimeClientTarget,
  revision: number | undefined
): Promise<void> {
  recordProjectCatalogMutationRevision(target, revision)
  await invalidateProjectCatalogTarget(readProjectCatalogQueryClient(), target)
}

export async function refreshAfterWorktreeMutation(
  target: RuntimeClientTarget,
  repoId: string,
  revision: number | undefined
): Promise<void> {
  recordWorktreeMutationRevision(target, repoId, revision)
  await readProjectCatalogQueryClient().invalidateQueries({
    queryKey: getRuntimeTargetOrpc(target).worktree.key()
  })
}
