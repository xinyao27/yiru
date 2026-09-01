import type { Store } from '../persistence/store'
import { loadKnownUsageWorktreesByRepo } from './worktree-metadata'

export function getUsageScopePaths(
  store: Pick<Store, 'getRepos' | 'getAllWorktreeMeta'>
): string[] {
  const worktreesByRepo = loadKnownUsageWorktreesByRepo(store, store.getRepos())
  return [...worktreesByRepo.values()].flatMap((worktrees) =>
    worktrees.map((worktree) => worktree.path)
  )
}
