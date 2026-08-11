import { parseExecutionHostId } from '@yiru/workbench-model/workspace'
import type { WorktreeRuntimeOwnerState } from '~renderer/lib/worktree-runtime-owner'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'

import { splitWorktreeSortOrderByHost } from './worktree-sort-order-host-split'

function ignoreSortOrderPersistenceFailure(promise: Promise<unknown>): void {
  void promise.catch(() => {
    // Why: sort-order restore is best-effort; SSH disconnects during smart sort
    // must not surface as unhandled rejections that pollute crash diagnostics.
  })
}

export function persistWorktreeSortOrderByHost(
  state: WorktreeRuntimeOwnerState,
  orderedIds: readonly string[]
): void {
  for (const group of splitWorktreeSortOrderByHost(state, orderedIds)) {
    const parsed = parseExecutionHostId(group.hostId)
    if (parsed?.kind === 'runtime') {
      ignoreSortOrderPersistenceFailure(
        callRuntimeOrpc(
          { kind: 'environment', environmentId: parsed.environmentId },
          (client) => client.worktree.persistSortOrder,
          { orderedIds: group.orderedIds },
          { timeoutMs: 15_000 }
        )
      )
      continue
    }

    ignoreSortOrderPersistenceFailure(
      workspaceHostClient.worktrees.persistSortOrder({ orderedIds: group.orderedIds })
    )
  }
}
