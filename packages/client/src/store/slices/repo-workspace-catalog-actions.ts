import type { StateCreator } from 'zustand'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../types'
import {
  clearRestoredFolderWorkspaceSessionOwners,
  fetchProjectGroupCatalogForTarget,
  mergeFetchedProjectGroupCatalog,
  fetchProjectGroupsForTarget,
  fetchFolderWorkspaceCatalogForTarget,
  mergeFetchedFolderWorkspaceCatalog,
  fetchFolderWorkspacesForTarget,
  listRuntimeEnvironmentsForAllHostLoad,
  type FetchedProjectGroupCatalog,
  type FetchedFolderWorkspaceCatalog
} from './repo-catalog-fetch'
import { getFirstPaintCatalogTarget, isEnvironmentAlreadyLoaded } from './repo-target-model'
import type { RepoSlice } from './repos'

export function createRepoWorkspaceCatalogActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<
  RepoSlice,
  | 'fetchProjectGroups'
  | 'fetchProjectGroupsForAllHosts'
  | 'fetchFolderWorkspaces'
  | 'fetchFolderWorkspacesForAllHosts'
> {
  return {
    fetchProjectGroups: async () => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const { projectGroups } = await fetchProjectGroupsForTarget(target, [])
        set({
          projectGroups,
          folderWorkspacePathStatuses: {}
        })
      } catch (err) {
        console.error('Failed to fetch project groups:', err)
      }
    },
    fetchProjectGroupsForAllHosts: async (options) => {
      // Why: startup renders an all-host sidebar; replacing groups with only the
      // active host would leave repos from other hosts visible but ungrouped.
      const applyCatalog = (catalog: FetchedProjectGroupCatalog): void => {
        set((s) => ({
          projectGroups: mergeFetchedProjectGroupCatalog(catalog, s.projectGroups).projectGroups,
          folderWorkspacePathStatuses: {}
        }))
      }

      const firstPaintTarget = getFirstPaintCatalogTarget(get().settings)
      try {
        if (firstPaintTarget) {
          applyCatalog(await fetchProjectGroupCatalogForTarget(firstPaintTarget))
        }
      } catch (err) {
        console.error('Failed to fetch first-paint project groups for all-host load:', err)
      }
      if (options?.remoteHosts === 'skip') {
        return
      }

      const environments = await listRuntimeEnvironmentsForAllHostLoad()
      await Promise.all(
        environments
          .filter((environment) => !isEnvironmentAlreadyLoaded(firstPaintTarget, environment.id))
          .map(async (environment) => {
            try {
              applyCatalog(
                await fetchProjectGroupCatalogForTarget({
                  kind: 'environment',
                  environmentId: environment.id
                })
              )
            } catch (err) {
              console.warn(`Skipped project groups for runtime environment ${environment.id}:`, err)
            }
          })
      )
    },
    fetchFolderWorkspaces: async () => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const { folderWorkspaces } = await fetchFolderWorkspacesForTarget(
          target,
          [],
          get().projectGroups
        )
        set({ folderWorkspaces, folderWorkspacePathStatuses: {} })
      } catch (err) {
        console.error('Failed to fetch folder workspaces:', err)
      }
    },
    fetchFolderWorkspacesForAllHosts: async (options) => {
      // Why: folder workspaces are owned through their project groups, so startup
      // must fetch groups first and then merge each host's folder slice.
      const applyCatalog = (catalog: FetchedFolderWorkspaceCatalog): void => {
        set((s) => ({
          folderWorkspaces: mergeFetchedFolderWorkspaceCatalog(
            catalog,
            s.folderWorkspaces,
            s.projectGroups
          ).folderWorkspaces,
          folderWorkspacePathStatuses: {}
        }))
      }

      const firstPaintTarget = getFirstPaintCatalogTarget(get().settings)
      let failed = false
      try {
        if (firstPaintTarget) {
          applyCatalog(await fetchFolderWorkspaceCatalogForTarget(firstPaintTarget))
        }
      } catch (err) {
        failed = true
        console.error('Failed to fetch first-paint folder workspaces for all-host load:', err)
      }
      if (options?.remoteHosts === 'skip') {
        return
      }

      const environments = await listRuntimeEnvironmentsForAllHostLoad()
      await Promise.all(
        environments
          .filter((environment) => !isEnvironmentAlreadyLoaded(firstPaintTarget, environment.id))
          .map(async (environment) => {
            try {
              applyCatalog(
                await fetchFolderWorkspaceCatalogForTarget({
                  kind: 'environment',
                  environmentId: environment.id
                })
              )
            } catch (err) {
              failed = true
              console.warn(
                `Skipped folder workspaces for runtime environment ${environment.id}:`,
                err
              )
            }
          })
      )
      if (!failed) {
        set((s) => ({
          restoredRuntimeHostIdByWorkspaceSessionKey: clearRestoredFolderWorkspaceSessionOwners(
            s.restoredRuntimeHostIdByWorkspaceSessionKey,
            s
          )
        }))
      }
    }
  }
}
