import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'

export function resolveSpoolLocalWslDistro(
  store: Store,
  target: SpoolOwnerWorktree
): string | null {
  const repo = store.getRepo(target.repoId)
  if (!repo || repo.connectionId) {
    return null
  }
  return getLocalProjectWorktreeGitOptions(store, repo).wslDistro ?? null
}
