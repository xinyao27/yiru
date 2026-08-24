import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { getProjectIdentityKey } from '~shared/project-host-setup-projection'
import type { Repo, ProjectGroup, FolderWorkspace } from '~shared/types'

import {
  projectCompatibilityFromRepos,
  mergeFetchedProjectCompatibilityForHost
} from './repo-compatibility-model'
import { getRepoHostIdentity } from './repo-host-identity'
import { reconcileFetchedRepos } from './repo-identity-reconcile'
import type { RepoSlice } from './repos'

export function mergeById<T extends { id: string }>(
  base: readonly T[],
  overlay: readonly T[]
): T[] {
  const merged = [...base]
  const indexById = new Map(merged.map((entry, index) => [entry.id, index]))
  for (const entry of overlay) {
    const index = indexById.get(entry.id)
    if (index === undefined) {
      indexById.set(entry.id, merged.length)
      merged.push(entry)
    } else {
      merged[index] = entry
    }
  }
  return merged
}

export function mergeFetchedReposForHost(
  previous: readonly Repo[],
  fetched: Repo[],
  hostId: string
): Repo[] {
  const fetchedWithProjectGroups = applyInheritedProjectGroups(previous, fetched)
  const fetchedIdentities = new Set(fetchedWithProjectGroups.map(getRepoHostIdentity))
  const preserved = previous.filter((repo) => {
    const existingHostId = getRepoExecutionHostId(repo)
    return existingHostId !== hostId || fetchedIdentities.has(getRepoHostIdentity(repo))
  })
  const merged = [...preserved]
  const indexByIdentity = new Map(merged.map((repo, index) => [getRepoHostIdentity(repo), index]))
  for (const repo of fetchedWithProjectGroups) {
    const identity = getRepoHostIdentity(repo)
    const existingIndex = indexByIdentity.get(identity)
    if (existingIndex === undefined) {
      indexByIdentity.set(identity, merged.length)
      merged.push(repo)
      continue
    }
    merged[existingIndex] = repo
  }
  return reconcileFetchedRepos(previous, merged)
}

export function applyInheritedProjectGroups(
  previous: readonly Repo[],
  fetched: readonly Repo[]
): Repo[] {
  const projectGroupIdByProject = new Map<string, string | null>()
  for (const repo of previous) {
    const projectGroupId =
      repo.projectGroupId === undefined ? undefined : (repo.projectGroupId ?? null)
    if (projectGroupId === undefined) {
      continue
    }
    const projectId = getProjectIdentityKey(repo)
    if (projectId.startsWith('repo:')) {
      continue
    }
    if (!projectGroupIdByProject.has(projectId)) {
      projectGroupIdByProject.set(projectId, projectGroupId)
    }
  }
  if (projectGroupIdByProject.size === 0) {
    return [...fetched]
  }
  return fetched.map((repo) => {
    if (repo.projectGroupId !== undefined) {
      return repo
    }
    const inheritedProjectGroupId = projectGroupIdByProject.get(getProjectIdentityKey(repo))
    if (inheritedProjectGroupId === undefined) {
      return repo
    }
    // Why: project groups are a local organization affordance. Runtime copies
    // of the same canonical project should appear in the user's existing group.
    return { ...repo, projectGroupId: inheritedProjectGroupId }
  })
}

export function mergeProjectCompatibilityForHostRepoChange({
  previous,
  nextRepos,
  hostId
}: {
  previous: Pick<RepoSlice, 'projects' | 'projectHostSetups'>
  nextRepos: readonly Repo[]
  hostId: string
}): Pick<RepoSlice, 'projects' | 'projectHostSetups'> {
  return mergeFetchedProjectCompatibilityForHost({
    previous,
    fetched: projectCompatibilityFromRepos(nextRepos),
    repos: nextRepos,
    hostId
  })
}

export function getProjectGroupHostId(
  group: Pick<ProjectGroup, 'connectionId' | 'executionHostId'>
) {
  if (group.executionHostId) {
    return group.executionHostId
  }
  return LOCAL_EXECUTION_HOST_ID
}

export function mergeFetchedProjectGroupsForHost(
  previous: readonly ProjectGroup[],
  fetched: ProjectGroup[],
  hostId: string
): ProjectGroup[] {
  const fetchedIds = new Set(fetched.map((group) => group.id))
  const preserved = previous.filter((group) => {
    const existingHostId = getProjectGroupHostId(group)
    return existingHostId !== hostId || fetchedIds.has(group.id)
  })
  return mergeById(preserved, fetched)
}

export function mergeFetchedFolderWorkspacesForHost({
  previous,
  fetched,
  projectGroups,
  hostId
}: {
  previous: readonly FolderWorkspace[]
  fetched: FolderWorkspace[]
  projectGroups: readonly ProjectGroup[]
  hostId: string
}): FolderWorkspace[] {
  const fetchedIds = new Set(fetched.map((workspace) => workspace.id))
  const projectGroupHostIds = new Map(
    projectGroups.map((group) => [group.id, getProjectGroupHostId(group)])
  )
  const preserved = previous.filter((workspace) => {
    const existingHostId = projectGroupHostIds.get(workspace.projectGroupId)
    return existingHostId === undefined || existingHostId !== hostId || fetchedIds.has(workspace.id)
  })
  return mergeById(preserved, fetched)
}
