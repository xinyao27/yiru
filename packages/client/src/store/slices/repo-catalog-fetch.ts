import { callRuntimeOrpc, createRuntimeOrpcClient } from '~renderer/runtime/orpc-client'
import type { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { runtimeEnvironmentsClient } from '~renderer/runtime/runtime-environments-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import type { ProjectHostSetupProjection } from '~shared/project-host-setup-projection'
import type { Repo, ProjectGroup, FolderWorkspace, NestedRepoScanResult } from '~shared/types'
import { parseWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'
import {
  mergeFetchedReposForHost,
  mergeFetchedProjectGroupsForHost,
  mergeFetchedFolderWorkspacesForHost
} from './repo-catalog-merge'
import {
  projectCompatibilityFromRepos,
  mergeProjectHostSetupCompatibility
} from './repo-compatibility-model'
import {
  repoWithFetchedOwner,
  projectGroupWithFetchedOwner,
  fetchProjectHostSetupCompatibility
} from './repo-target-model'
import { normalizeNestedRepoScanResult, getRuntimeTargetHostId } from './repo-update-model'
import type { RepoSlice } from './repos'

export type FetchedRepoCatalog = {
  repos: Repo[]
  projectHostSetupCompatibility: ProjectHostSetupProjection
  hostId: ReturnType<typeof getRuntimeTargetHostId>
}

export type FetchedProjectGroupCatalog = {
  projectGroups: ProjectGroup[]
  hostId: ReturnType<typeof getRuntimeTargetHostId>
}

export type FetchedFolderWorkspaceCatalog = {
  folderWorkspaces: FolderWorkspace[]
  hostId: ReturnType<typeof getRuntimeTargetHostId>
}

export async function fetchRepoCatalogForTarget(
  target: ReturnType<typeof getActiveRuntimeTarget>
): Promise<FetchedRepoCatalog> {
  const fetchedRepos =
    target.kind === 'local'
      ? await workspaceHostClient.repos.list()
      : (
          await callRuntimeOrpc(target, (client) => client.repo.list, undefined, {
            timeoutMs: 15_000,
            reuseRecentCompatibilityFailure: true
          })
        ).repos
  const repos = fetchedRepos.map((repo) => repoWithFetchedOwner(repo, target))
  return {
    repos,
    projectHostSetupCompatibility: await fetchProjectHostSetupCompatibility(target, repos),
    hostId: getRuntimeTargetHostId(target)
  }
}

export function mergeFetchedRepoCatalog(
  catalog: FetchedRepoCatalog,
  currentRepos: readonly Repo[]
): {
  repos: Repo[]
  projectHostSetupCompatibility: ProjectHostSetupProjection
  hostId: ReturnType<typeof getRuntimeTargetHostId>
} {
  const repos = mergeFetchedReposForHost(currentRepos, catalog.repos, catalog.hostId)
  return {
    repos,
    projectHostSetupCompatibility: catalog.projectHostSetupCompatibility,
    hostId: catalog.hostId
  }
}

export function projectCompatibilityForReconciledRepos(
  repos: readonly Repo[],
  fetched: ProjectHostSetupProjection
): Pick<RepoSlice, 'projects' | 'projectHostSetups'> {
  return mergeProjectHostSetupCompatibility(projectCompatibilityFromRepos(repos), fetched)
}

export function filterTrustedYiruHooksToValidRepos(
  trust: AppState['trustedYiruHooks'],
  validRepoIds: Set<string>
): AppState['trustedYiruHooks'] {
  const next: AppState['trustedYiruHooks'] = {}
  for (const [repoId, entry] of Object.entries(trust)) {
    if (validRepoIds.has(repoId)) {
      next[repoId] = entry
    }
  }
  return next
}

export function clearRestoredFolderWorkspaceSessionOwners(
  owners: AppState['restoredRuntimeHostIdByWorkspaceSessionKey'] | undefined,
  state: Pick<AppState, 'folderWorkspaces' | 'projectGroups'>
): AppState['restoredRuntimeHostIdByWorkspaceSessionKey'] {
  const next: AppState['restoredRuntimeHostIdByWorkspaceSessionKey'] = {}
  for (const [key, hostId] of Object.entries(owners ?? {})) {
    const scope = parseWorkspaceKey(key)
    if (scope?.type !== 'folder') {
      next[key] = hostId
      continue
    }
    const workspace = state.folderWorkspaces.find((entry) => entry.id === scope.folderWorkspaceId)
    if (workspace && !state.projectGroups.some((group) => group.id === workspace.projectGroupId)) {
      // Why: folder workspace ownership is resolved through its project group.
      // If that catalog is still missing, keep the restored host owner so a
      // session write before the next retry does not move runtime tabs local.
      next[key] = hostId
    }
  }
  return next
}

export async function fetchProjectGroupCatalogForTarget(
  target: ReturnType<typeof getActiveRuntimeTarget>
): Promise<FetchedProjectGroupCatalog> {
  const fetchedGroups = (
    await callRuntimeOrpc(target, (client) => client.projectGroup.list, undefined, {
      timeoutMs: 15_000,
      reuseRecentCompatibilityFailure: true
    })
  ).groups
  return {
    projectGroups: fetchedGroups.map((group) => projectGroupWithFetchedOwner(group, target)),
    hostId: getRuntimeTargetHostId(target)
  }
}

// Why: nested-scan progress is per-scanId, not host-wide (see
// `projectGroup.events.subscribe`'s contract comment) — the caller passes
// its own scanId and callback, this just owns the stream's lifecycle.
export async function subscribeToNestedRepoScanProgress(
  target: ReturnType<typeof getActiveRuntimeTarget>,
  scanId: string,
  onProgress: (scan: NestedRepoScanResult) => void
): Promise<() => void> {
  const abort = new AbortController()
  try {
    const connection = await createRuntimeOrpcClient(target, {
      timeoutMs: 15_000,
      signal: abort.signal
    })
    const stream = await connection.client.projectGroup.events.subscribe(undefined, {
      signal: abort.signal
    })
    void (async () => {
      try {
        for await (const event of stream) {
          if (event.type === 'nestedRepoScanProgress' && event.scanId === scanId) {
            onProgress(normalizeNestedRepoScanResult(event.scan))
          }
        }
      } catch {
        // Why: the scan RPC call resolves/rejects on its own — a dropped
        // progress stream just means fewer ticks, not a failed scan.
      } finally {
        connection.close()
      }
    })()
    return () => abort.abort()
  } catch (err) {
    console.error('Failed to subscribe to nested repo scan progress:', err)
    return () => {}
  }
}

export function mergeFetchedProjectGroupCatalog(
  catalog: FetchedProjectGroupCatalog,
  currentProjectGroups: readonly ProjectGroup[]
): { projectGroups: ProjectGroup[]; hostId: ReturnType<typeof getRuntimeTargetHostId> } {
  return {
    projectGroups: mergeFetchedProjectGroupsForHost(
      currentProjectGroups,
      catalog.projectGroups,
      catalog.hostId
    ),
    hostId: catalog.hostId
  }
}

export async function fetchProjectGroupsForTarget(
  target: ReturnType<typeof getActiveRuntimeTarget>,
  currentProjectGroups: readonly ProjectGroup[]
): Promise<{ projectGroups: ProjectGroup[]; hostId: ReturnType<typeof getRuntimeTargetHostId> }> {
  return mergeFetchedProjectGroupCatalog(
    await fetchProjectGroupCatalogForTarget(target),
    currentProjectGroups
  )
}

export async function fetchFolderWorkspaceCatalogForTarget(
  target: ReturnType<typeof getActiveRuntimeTarget>
): Promise<FetchedFolderWorkspaceCatalog> {
  const fetchedFolderWorkspaces = (
    await callRuntimeOrpc(target, (client) => client.folderWorkspace.list, undefined, {
      timeoutMs: 15_000,
      reuseRecentCompatibilityFailure: true
    })
  ).folderWorkspaces
  return {
    folderWorkspaces: fetchedFolderWorkspaces,
    hostId: getRuntimeTargetHostId(target)
  }
}

export function mergeFetchedFolderWorkspaceCatalog(
  catalog: FetchedFolderWorkspaceCatalog,
  currentFolderWorkspaces: readonly FolderWorkspace[],
  projectGroups: readonly ProjectGroup[]
): {
  folderWorkspaces: FolderWorkspace[]
  hostId: ReturnType<typeof getRuntimeTargetHostId>
} {
  return {
    folderWorkspaces: mergeFetchedFolderWorkspacesForHost({
      previous: currentFolderWorkspaces,
      fetched: catalog.folderWorkspaces,
      projectGroups,
      hostId: catalog.hostId
    }),
    hostId: catalog.hostId
  }
}

export async function fetchFolderWorkspacesForTarget(
  target: ReturnType<typeof getActiveRuntimeTarget>,
  currentFolderWorkspaces: readonly FolderWorkspace[],
  projectGroups: readonly ProjectGroup[]
): Promise<{
  folderWorkspaces: FolderWorkspace[]
  hostId: ReturnType<typeof getRuntimeTargetHostId>
}> {
  return mergeFetchedFolderWorkspaceCatalog(
    await fetchFolderWorkspaceCatalogForTarget(target),
    currentFolderWorkspaces,
    projectGroups
  )
}

export async function listRuntimeEnvironmentsForAllHostLoad(): Promise<{ id: string }[]> {
  try {
    return (await runtimeEnvironmentsClient.list()) ?? []
  } catch (err) {
    console.warn('Failed to list runtime environments for all-host load:', err)
    return []
  }
}
