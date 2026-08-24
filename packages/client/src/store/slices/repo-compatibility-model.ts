import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import {
  projectHostSetupProjectionFromRepos,
  type ProjectHostSetupProjection
} from '~shared/project-host-setup-projection'
import type { Project, Repo, ProjectHostSetup } from '~shared/types'

import type { ProjectUpdate } from './repo-update-model'
import type { RepoSlice } from './repos'

export function projectCompatibilityFromRepos(
  repos: readonly Repo[]
): Pick<RepoSlice, 'projects' | 'projectHostSetups'> {
  const projection = projectHostSetupProjectionFromRepos(repos)
  return {
    projects: projection.projects,
    projectHostSetups: projection.setups
  }
}

export function mergeProjectCompatibilityProject(base: Project, overlay: Project): Project {
  const localWindowsRuntimePreference =
    'localWindowsRuntimePreference' in overlay
      ? overlay.localWindowsRuntimePreference
      : base.localWindowsRuntimePreference
  const project: Project = {
    ...base,
    ...overlay,
    // Why: all-host startup fetches hosts separately; one host's project record
    // must not erase repo ownership learned from another host with the same id.
    sourceRepoIds: [...new Set([...base.sourceRepoIds, ...overlay.sourceRepoIds])],
    createdAt: Math.min(base.createdAt, overlay.createdAt),
    updatedAt: Math.max(base.updatedAt, overlay.updatedAt)
  }
  if (localWindowsRuntimePreference === undefined) {
    delete project.localWindowsRuntimePreference
  } else {
    project.localWindowsRuntimePreference = localWindowsRuntimePreference
  }
  return project
}

export function mergeProjectCompatibilityProjects(
  base: readonly Project[],
  overlay: readonly Project[]
): Project[] {
  const merged = [...base]
  const indexById = new Map(merged.map((entry, index) => [entry.id, index]))
  for (const entry of overlay) {
    const index = indexById.get(entry.id)
    if (index === undefined) {
      indexById.set(entry.id, merged.length)
      merged.push(entry)
    } else {
      merged[index] = mergeProjectCompatibilityProject(merged[index]!, entry)
    }
  }
  return merged
}

export function mergeUpdatedProjectCompatibilityProject(
  base: Project,
  updated: Project,
  updates: ProjectUpdate
): Project {
  const project = mergeProjectCompatibilityProject(base, updated)
  if ('localWindowsRuntimePreference' in updates) {
    const localWindowsRuntimePreference =
      'localWindowsRuntimePreference' in updated
        ? updated.localWindowsRuntimePreference
        : updates.localWindowsRuntimePreference
    // Why: project.update returns one host's project record, but preference
    // clears must still override the cross-host metadata preservation merge.
    if (localWindowsRuntimePreference === undefined) {
      delete project.localWindowsRuntimePreference
    } else {
      project.localWindowsRuntimePreference = localWindowsRuntimePreference
    }
  }
  return project
}

export function getCurrentSourceRepoIds(
  project: Project,
  currentRepoIds: ReadonlySet<string>
): string[] {
  return project.sourceRepoIds.filter((repoId) => currentRepoIds.has(repoId))
}

export function getReposById(repos: readonly Repo[]): Map<string, Repo[]> {
  const reposById = new Map<string, Repo[]>()
  for (const repo of repos) {
    const existing = reposById.get(repo.id)
    if (existing) {
      existing.push(repo)
    } else {
      reposById.set(repo.id, [repo])
    }
  }
  return reposById
}

export function getSourceRepoIdsOutsideHost(
  project: Project,
  reposById: ReadonlyMap<string, readonly Repo[]>,
  hostId: string
): string[] {
  return project.sourceRepoIds.filter((repoId) => {
    const repos = reposById.get(repoId) ?? []
    return repos.some((repo) => getRepoExecutionHostId(repo) !== hostId)
  })
}

export function getMergedSourceRepoIdsForHostRefresh(
  previous: Project,
  current: Project,
  reposById: ReadonlyMap<string, readonly Repo[]>,
  hostId: string
): string[] {
  return [
    ...new Set([
      ...getSourceRepoIdsOutsideHost(previous, reposById, hostId),
      ...getCurrentSourceRepoIds(current, new Set(reposById.keys()))
    ])
  ]
}

export function projectWithCurrentSourceRepoIds(
  project: Project,
  currentRepoIds: ReadonlySet<string>
): Project {
  const sourceRepoIds = getCurrentSourceRepoIds(project, currentRepoIds)
  return sourceRepoIds.length === project.sourceRepoIds.length
    ? project
    : { ...project, sourceRepoIds }
}

export function mergePreviousProjectMetadata(
  previous: Project,
  current: Project,
  reposById: ReadonlyMap<string, readonly Repo[]>,
  hostId: string
): Project {
  const project = mergeProjectCompatibilityProject(previous, current)
  if (hostId === LOCAL_EXECUTION_HOST_ID) {
    // Why: `localWindowsRuntimePreference` belongs to the local host; a local
    // refresh that omits it is authoritative and should clear stale renderer state.
    if ('localWindowsRuntimePreference' in current) {
      if (current.localWindowsRuntimePreference === undefined) {
        delete project.localWindowsRuntimePreference
      } else {
        project.localWindowsRuntimePreference = current.localWindowsRuntimePreference
      }
    } else {
      delete project.localWindowsRuntimePreference
    }
  } else if (previous.localWindowsRuntimePreference !== undefined) {
    // Why: remote runtimes can have their own local Windows preference; they must
    // not overwrite the client-local project runtime setting.
    project.localWindowsRuntimePreference = previous.localWindowsRuntimePreference
  }
  return {
    ...project,
    // Why: fetched project metadata can lag behind repo.list; repo ownership
    // must track the freshly reconciled repos so removed host repos do not linger.
    sourceRepoIds: getMergedSourceRepoIdsForHostRefresh(previous, current, reposById, hostId)
  }
}

export function mergeProjectHostSetupCompatibility(
  derived: Pick<RepoSlice, 'projects' | 'projectHostSetups'>,
  fetched: ProjectHostSetupProjection
): Pick<RepoSlice, 'projects' | 'projectHostSetups'> {
  const fetchedSetupOwners = new Set(fetched.setups.map(getProjectHostSetupOwnerKey))
  const derivedSetups = derived.projectHostSetups.filter(
    (setup) => !fetchedSetupOwners.has(getProjectHostSetupOwnerKey(setup))
  )
  const projectHostSetups = mergeProjectHostSetupsByOwner(derivedSetups, fetched.setups)
  const setupProjectIds = new Set(projectHostSetups.map((setup) => setup.projectId))
  const fetchedProjectIds = new Set(fetched.projects.map((project) => project.id))
  return {
    projects: mergeProjectCompatibilityProjects(derived.projects, fetched.projects).filter(
      (project) => fetchedProjectIds.has(project.id) || setupProjectIds.has(project.id)
    ),
    projectHostSetups
  }
}

export function getProjectHostSetupOwnerKey(setup: ProjectHostSetup): string {
  return `${setup.hostId}:${setup.repoId || setup.id}`
}

export function mergeProjectHostSetupsByOwner(
  base: readonly ProjectHostSetup[],
  overlay: readonly ProjectHostSetup[]
): ProjectHostSetup[] {
  const merged = [...base]
  const indexByOwner = new Map(
    merged.map((entry, index) => [getProjectHostSetupOwnerKey(entry), index])
  )
  for (const entry of overlay) {
    const index = indexByOwner.get(getProjectHostSetupOwnerKey(entry))
    if (index === undefined) {
      indexByOwner.set(getProjectHostSetupOwnerKey(entry), merged.length)
      merged.push(entry)
    } else {
      merged[index] = entry
    }
  }
  return merged
}

export function getProjectHostIds(
  project: Project,
  setups: readonly ProjectHostSetup[],
  repos: readonly Repo[]
): Set<string> {
  const hostIds = getExplicitProjectHostIds(project, setups, repos)
  if (hostIds.size === 0) {
    hostIds.add(LOCAL_EXECUTION_HOST_ID)
  }
  return hostIds
}

export function getExplicitProjectHostIds(
  project: Project,
  setups: readonly ProjectHostSetup[],
  repos: readonly Repo[]
): Set<string> {
  const hostIds = new Set<string>()
  const sourceRepoIds = new Set(project.sourceRepoIds)
  for (const setup of setups) {
    if (setup.projectId === project.id) {
      hostIds.add(setup.hostId)
    }
  }
  for (const repo of repos) {
    if (sourceRepoIds.has(repo.id)) {
      hostIds.add(getRepoExecutionHostId(repo))
    }
  }
  return hostIds
}

export function mergeFetchedProjectCompatibilityForHost({
  previous,
  fetched,
  repos,
  hostId
}: {
  previous: Pick<RepoSlice, 'projects' | 'projectHostSetups'>
  fetched: Pick<RepoSlice, 'projects' | 'projectHostSetups'>
  repos: readonly Repo[]
  hostId: string
}): Pick<RepoSlice, 'projects' | 'projectHostSetups'> {
  const setupBelongsToFetchedCatalog = (setup: ProjectHostSetup): boolean => {
    if (hostId !== LOCAL_EXECUTION_HOST_ID) {
      return setup.hostId === hostId
    }
    // Why: desktop persistence owns local setups; runtime setups remain
    // authoritative on their runtime host.
    return setup.hostId === LOCAL_EXECUTION_HOST_ID
  }
  const fetchedSetupsForHost = fetched.projectHostSetups.filter(setupBelongsToFetchedCatalog)
  const preservedSetups = previous.projectHostSetups.filter(
    (setup) => !setupBelongsToFetchedCatalog(setup)
  )
  const projectHostSetups = mergeProjectHostSetupsByOwner(preservedSetups, fetchedSetupsForHost)
  const previousProjectById = new Map(previous.projects.map((project) => [project.id, project]))
  const reposById = getReposById(repos)
  const currentRepoIds = new Set(repos.map((repo) => repo.id))
  const projectHasHost = (project: Project, setups: readonly ProjectHostSetup[]): boolean =>
    getProjectHostIds(project, setups, repos).has(hostId)
  const projectHasCurrentOwnerOutsideHost = (project: Project): boolean =>
    [...getExplicitProjectHostIds(project, projectHostSetups, repos)].some(
      (ownerHostId) => ownerHostId !== hostId
    )
  const fetchedProjects = fetched.projects
    .filter((project) => {
      const previousProject = previousProjectById.get(project.id)
      // Why: repo-derived compatibility projects include every known host.
      // A one-host refresh should only reconcile that host or prune its stale ownership.
      return (
        projectHasHost(project, fetched.projectHostSetups) ||
        (previousProject ? projectHasHost(previousProject, previous.projectHostSetups) : false)
      )
    })
    .map((project) => {
      const previousProject = previousProjectById.get(project.id)
      return previousProject
        ? mergePreviousProjectMetadata(previousProject, project, reposById, hostId)
        : projectWithCurrentSourceRepoIds(project, currentRepoIds)
    })
  const fetchedProjectIds = new Set(fetchedProjects.map((project) => project.id))
  const preservedProjects = previous.projects.filter(
    (project) =>
      !fetchedProjectIds.has(project.id) &&
      (!getProjectHostIds(project, previous.projectHostSetups, repos).has(hostId) ||
        projectHasCurrentOwnerOutsideHost(project))
  )
  return {
    projects: mergeProjectCompatibilityProjects(
      preservedProjects.map((project) => {
        const sourceRepoIds = getSourceRepoIdsOutsideHost(project, reposById, hostId)
        return sourceRepoIds.length === project.sourceRepoIds.length
          ? project
          : { ...project, sourceRepoIds }
      }),
      fetchedProjects
    ),
    projectHostSetups
  }
}
