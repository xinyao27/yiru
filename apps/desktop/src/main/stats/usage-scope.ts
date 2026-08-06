import type { Store } from '../persistence'
import { loadKnownUsageWorktreesByRepo } from '../usage-worktree-metadata'

export function getUsageScopePaths(
  store: Pick<Store, 'getRepos' | 'getAllWorktreeMeta'>
): string[] {
  const worktreesByRepo = loadKnownUsageWorktreesByRepo(store, store.getRepos())
  return [...worktreesByRepo.values()].flatMap((worktrees) =>
    worktrees.map((worktree) => worktree.path)
  )
}
