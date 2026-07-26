import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import type { CoworkingOwnerWorktree } from './worktree-incarnation'

export function resolveCoworkingLocalWslDistro(
  store: Store,
  target: CoworkingOwnerWorktree
): string | null {
  const repo = store.getRepo(target.repoId)
  if (!repo || repo.connectionId) {
    return null
  }
  return getLocalProjectWorktreeGitOptions(store, repo).wslDistro ?? null
}
