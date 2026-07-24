import {
  getRepoExecutionHostId,
  splitWorktreeIdForFilesystem,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'

import { parseWorkspaceKey } from '../../shared/workspace-scope'

type RepoExecutionOwner = {
  id: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
}

export function collectLiveRepoIdsForHost(
  repos: readonly RepoExecutionOwner[],
  hostId: ExecutionHostId
): Set<string> {
  return new Set(
    repos.filter((repo) => getRepoExecutionHostId(repo) === hostId).map((repo) => repo.id)
  )
}

export function shouldHydratePersistedWorktreeSession(
  worktreeId: string,
  liveRepoIds: ReadonlySet<string>
): boolean {
  const scope = parseWorkspaceKey(worktreeId)
  const ownerWorktreeId = scope?.type === 'worktree' ? scope.worktreeId : worktreeId
  const ownerRepoId = splitWorktreeIdForFilesystem(ownerWorktreeId)?.repoId
  // Why: legacy/synthetic owner keys may be unparseable; preserving them is
  // safer than deleting session state whose ownership cannot be established.
  return !ownerRepoId || liveRepoIds.has(ownerRepoId)
}
