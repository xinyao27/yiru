import { isPathInsideOrEqual } from '@yiru/workbench-model/platform'
import {
  getRepoExecutionHostId,
  normalizeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { getProjectGroupSubtreeIds } from '~shared/project-groups'
import type { Repo, ProjectGroup, FolderWorkspace } from '~shared/types'

export function sanitizeNestedRepoRuntimeImportError(context: string, error: unknown): string {
  console.warn(`[project-groups] ${context}`, error)
  return 'Repository could not be imported'
}

export type MobileResumeTargetStatus = 'local' | 'runtime' | 'unknown'

export function mobileExecutionHostTargetStatus(
  hostId: ExecutionHostId | null | undefined
): MobileResumeTargetStatus {
  return parseExecutionHostId(hostId)?.kind ?? 'unknown'
}

export function mobileFolderResumeTargetStatus(args: {
  folderWorkspace: FolderWorkspace
  projectGroup: ProjectGroup
  projectGroups: readonly ProjectGroup[]
  repos: readonly Repo[]
}): MobileResumeTargetStatus {
  const explicitHostId = normalizeExecutionHostId(args.projectGroup.executionHostId)
  if (explicitHostId) {
    return mobileExecutionHostTargetStatus(explicitHostId)
  }

  const groupIds = getProjectGroupSubtreeIds(args.projectGroups, args.projectGroup.id)
  const groupRepos = args.repos.filter(
    (repo) => typeof repo.projectGroupId === 'string' && groupIds.has(repo.projectGroupId)
  )
  const pathRepos = args.repos.filter(
    (repo) =>
      !(typeof repo.projectGroupId === 'string' && groupIds.has(repo.projectGroupId)) &&
      isPathInsideOrEqual(args.folderWorkspace.folderPath, repo.path)
  )
  const candidateRepos = args.folderWorkspace.connectionId
    ? [
        ...groupRepos,
        ...pathRepos.filter(
          (repo) => (repo.connectionId ?? null) === args.folderWorkspace.connectionId
        )
      ]
    : groupRepos.length === 0
      ? pathRepos
      : (() => {
          const groupConnectionIds = new Set(groupRepos.map((entry) => entry.connectionId ?? null))
          return [
            ...groupRepos,
            ...pathRepos.filter((repo) => groupConnectionIds.has(repo.connectionId ?? null))
          ]
        })()
  if (candidateRepos.length === 0) {
    return 'local'
  }
  const hostIds = candidateRepos.map(getRepoExecutionHostId)
  const statuses = hostIds.map(mobileExecutionHostTargetStatus)
  if (statuses.includes('runtime')) {
    return 'runtime'
  }
  return new Set(hostIds).size === 1 ? (statuses[0] ?? 'unknown') : 'unknown'
}
