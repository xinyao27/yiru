import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import { getProjectHostSetupForRepo } from '../../shared/project-host-setup-projection'
import { getRepoKind } from '../../shared/repo-kind'
import { getRepoIdFromWorktreeId } from '../../shared/worktree-id'
import type { DetectedWorktree, ProjectHostSetup, Repo, WorktreeMeta } from '../../shared/types'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'

export function projectRegisteredSpoolWorktree(
  repo: Repo,
  worktree: DetectedWorktree,
  meta: WorktreeMeta | undefined,
  setups: readonly ProjectHostSetup[]
): SpoolOwnerWorktree | null {
  if (!meta?.instanceId || (worktree.instanceId && worktree.instanceId !== meta.instanceId)) {
    return null
  }
  const setup = getProjectHostSetupForRepo(setups, repo)
  const repoExecutionHostId = getRepoExecutionHostId(repo)
  const runtimeBacked = parseExecutionHostId(repoExecutionHostId)?.kind === 'runtime'
  return {
    kind: getRepoKind(repo),
    worktreeId: worktree.id,
    instanceId: meta.instanceId,
    projectId: worktree.projectId ?? meta.projectId ?? setup.projectId,
    repoId: repo.id,
    // Why: detected runtime rows describe the inner host; the owner gateway
    // must route through the outer paired runtime and let it resolve that host.
    executionHostId: runtimeBacked
      ? repoExecutionHostId
      : (worktree.hostId ?? meta.hostId ?? repoExecutionHostId),
    ...(!runtimeBacked && repo.connectionId !== undefined
      ? { connectionId: repo.connectionId }
      : {}),
    projectHostSetupId: worktree.projectHostSetupId ?? meta.projectHostSetupId ?? setup.id,
    worktreePath: worktree.path
  }
}

export function spoolRepoMayContainProject(
  repo: Repo,
  projectId: string,
  setups: readonly ProjectHostSetup[],
  metas: Readonly<Record<string, WorktreeMeta>>
): boolean {
  if (getProjectHostSetupForRepo(setups, repo).projectId === projectId) {
    return true
  }
  return Object.entries(metas).some(
    ([worktreeId, meta]) =>
      getRepoIdFromWorktreeId(worktreeId) === repo.id && meta.projectId === projectId
  )
}
