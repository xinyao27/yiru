import type { Repo, TerminalTab, Worktree } from '~shared/types'

function indexFirstById<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  const index = new Map<string, T>()
  for (const row of rows) {
    // Why: session hydration historically used a linear find, so duplicate
    // recovery records must continue resolving to the first observed owner.
    if (!index.has(row.id)) {
      index.set(row.id, row)
    }
  }
  return index
}

export function buildTerminalSessionOwnerIndexes(
  worktreesByRepo: Record<string, Worktree[]>,
  repos: readonly Repo[]
): {
  worktreeById: Map<string, Worktree>
  repoById: Map<string, Repo>
} {
  const worktreeById = new Map<string, Worktree>()
  for (const worktrees of Object.values(worktreesByRepo)) {
    for (const worktree of worktrees) {
      // Why: preserve the first-match hydration behavior without flattening
      // every repo's worktree list into another transient array.
      if (!worktreeById.has(worktree.id)) {
        worktreeById.set(worktree.id, worktree)
      }
    }
  }
  return {
    worktreeById,
    repoById: indexFirstById(repos)
  }
}

export function buildTerminalSessionTabIndex(
  tabs: readonly TerminalTab[]
): Map<string, TerminalTab> {
  return indexFirstById(tabs)
}
