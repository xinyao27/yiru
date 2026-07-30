import type { Worktree } from '../../../../shared/types'

export function buildWorktreeByIdIndex(
  worktreesByRepo: Record<string, Worktree[]>
): Map<string, Worktree> {
  const index = new Map<string, Worktree>()
  for (const worktrees of Object.values(worktreesByRepo)) {
    for (const worktree of worktrees) {
      // Why: preserve the first-match behavior of the linear lookup this replaces.
      if (!index.has(worktree.id)) {
        index.set(worktree.id, worktree)
      }
    }
  }
  return index
}

export function buildByIdIndex<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  const index = new Map<string, T>()
  for (const row of rows) {
    if (!index.has(row.id)) {
      index.set(row.id, row)
    }
  }
  return index
}
