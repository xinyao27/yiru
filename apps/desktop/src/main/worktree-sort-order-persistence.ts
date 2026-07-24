import type { WorktreeMeta } from '../shared/types'

type WorktreeSortOrderStore = {
  getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined
  setWorktreeMeta(worktreeId: string, meta: Partial<WorktreeMeta>): WorktreeMeta
}

export function persistExistingWorktreeSortOrder(
  store: WorktreeSortOrderStore,
  orderedIds: readonly string[],
  now = Date.now()
): number {
  let updated = 0
  for (let index = 0; index < orderedIds.length; index++) {
    const worktreeId = orderedIds[index]
    // Why: renderer snapshots are projections of known state; stale ids must
    // not mint metadata that can resurrect a removed workspace on restart.
    if (!store.getWorktreeMeta(worktreeId)) {
      continue
    }
    store.setWorktreeMeta(worktreeId, { sortOrder: now - index * 1000 })
    updated++
  }
  return updated
}
