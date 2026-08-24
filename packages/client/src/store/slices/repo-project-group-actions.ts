import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import { formatFolderWorkspaceCreateError } from '~renderer/components/sidebar/folder-workspace-path-status'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { getProjectGroupSubtreeIds } from '~shared/project-groups'
import { folderWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'
import { selectProjectGroupRemovalTargets } from './project-group-removal-targets'
import { mergeProjectCompatibilityForHostRepoChange } from './repo-catalog-merge'
import { findRepoForHost, repoMatchesHostIdentity } from './repo-host-identity'
import {
  settingsForRepoOwner,
  getFolderWorkspacePathStatusRouteSettings
} from './repo-path-status-model'
import { repoWithFetchedOwner, projectGroupWithFetchedOwner } from './repo-target-model'
import type { ProjectRemovalFailure } from './repo-update-model'
import type { RepoSlice } from './repos'

export function createRepoProjectGroupActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<
  RepoSlice,
  | 'createProjectGroup'
  | 'createFolderWorkspace'
  | 'updateFolderWorkspace'
  | 'deleteFolderWorkspace'
  | 'updateProjectGroup'
  | 'deleteProjectGroup'
  | 'deleteProjectGroupWithContainedProjects'
  | 'moveProjectToGroup'
> {
  return {
    createProjectGroup: async (name) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const group = (
          await callRuntimeOrpc(
            target,
            (client) => client.projectGroup.create,
            { name, createdFrom: 'manual' },
            { timeoutMs: 15_000 }
          )
        ).group
        const ownedGroup = projectGroupWithFetchedOwner(group, target)
        set((s) => ({
          projectGroups: [...s.projectGroups, ownedGroup],
          folderWorkspacePathStatuses: {}
        }))
        return ownedGroup
      } catch (err) {
        console.error('Failed to create project group:', err)
        return null
      }
    },
    createFolderWorkspace: async (args, options) => {
      try {
        const target = getActiveRuntimeTarget(
          getFolderWorkspacePathStatusRouteSettings(options, get().settings)
        )
        const workspace = (
          await callRuntimeOrpc(target, (client) => client.folderWorkspace.create, args, {
            timeoutMs: 15_000
          })
        ).folderWorkspace
        set((s) => ({
          folderWorkspaces: [workspace, ...s.folderWorkspaces],
          folderWorkspacePathStatuses: {}
        }))
        return workspace
      } catch (err) {
        console.error('Failed to create folder workspace:', err)
        const { title, description } = formatFolderWorkspaceCreateError(err)
        throw new Error(`${title}. ${description}`)
      }
    },
    updateFolderWorkspace: async (folderWorkspaceId, updates) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const updated = (
          await callRuntimeOrpc(
            target,
            (client) => client.folderWorkspace.update,
            { folderWorkspaceId, updates },
            { timeoutMs: 15_000 }
          )
        ).folderWorkspace
        if (!updated) {
          return false
        }
        set((s) => ({
          folderWorkspaces: s.folderWorkspaces.map((workspace) =>
            workspace.id === folderWorkspaceId ? updated : workspace
          ),
          folderWorkspacePathStatuses: {}
        }))
        return true
      } catch (err) {
        console.error('Failed to update folder workspace:', err)
        return false
      }
    },
    deleteFolderWorkspace: async (folderWorkspaceId) => {
      try {
        const target = getActiveRuntimeTarget(get().settings)
        const deleted = (
          await callRuntimeOrpc(
            target,
            (client) => client.folderWorkspace.delete,
            { folderWorkspaceId },
            { timeoutMs: 15_000 }
          )
        ).deleted
        if (!deleted) {
          return false
        }
        const workspaceKey = folderWorkspaceKey(folderWorkspaceId)
        set((s) => ({
          folderWorkspaces: s.folderWorkspaces.filter(
            (workspace) => workspace.id !== folderWorkspaceId
          ),
          folderWorkspacePathStatuses: {}
        }))
        get().purgeWorktreeTerminalState([workspaceKey])
        return true
      } catch (err) {
        console.error('Failed to delete folder workspace:', err)
        return false
      }
    },
    updateProjectGroup: async (groupId, updates) => {
      try {
        // Why: project groups are focused-host-scoped by design — fetch/create/update/
        // delete all route by the focused host, and the list is replaced (not merged).
        const target = getActiveRuntimeTarget(get().settings)
        const updated = (
          await callRuntimeOrpc(
            target,
            (client) => client.projectGroup.update,
            { groupId, updates },
            { timeoutMs: 15_000 }
          )
        ).group
        if (!updated) {
          return false
        }
        const ownedGroup = projectGroupWithFetchedOwner(updated, target)
        set((s) => ({
          projectGroups: s.projectGroups.map((group) =>
            group.id === groupId ? ownedGroup : group
          ),
          folderWorkspacePathStatuses: {}
        }))
        return true
      } catch (err) {
        console.error('Failed to update project group:', err)
        return false
      }
    },
    deleteProjectGroup: async (groupId) => {
      try {
        // Why: project groups are focused-host-scoped by design (see updateProjectGroup).
        const target = getActiveRuntimeTarget(get().settings)
        const deleted = (
          await callRuntimeOrpc(
            target,
            (client) => client.projectGroup.delete,
            { groupId },
            { timeoutMs: 15_000 }
          )
        ).deleted
        if (!deleted) {
          return false
        }
        set((s) => {
          const deletedGroupIds = getProjectGroupSubtreeIds(s.projectGroups, groupId)
          return {
            projectGroups: s.projectGroups.filter((group) => !deletedGroupIds.has(group.id)),
            folderWorkspaces: s.folderWorkspaces.filter(
              (workspace) => !deletedGroupIds.has(workspace.projectGroupId)
            ),
            repos: s.repos.map((repo) =>
              repo.projectGroupId && deletedGroupIds.has(repo.projectGroupId)
                ? { ...repo, projectGroupId: null }
                : repo
            ),
            folderWorkspacePathStatuses: {}
          }
        })
        return true
      } catch (err) {
        console.error('Failed to delete project group:', err)
        return false
      }
    },
    deleteProjectGroupWithContainedProjects: async (groupId, options) => {
      const targets = selectProjectGroupRemovalTargets(get().projectGroups, get().repos, groupId)
      const requestedProjectIds = options.removeContainedProjects ? targets.projectIds : []
      if (!targets.groupExists) {
        return {
          status: 'missing-group',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      const deleted = await get().deleteProjectGroup(groupId)
      if (!deleted) {
        return {
          status: 'group-delete-failed',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      if (!options.removeContainedProjects) {
        return {
          status: 'deleted-group',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      const removedProjectIds: string[] = []
      const failedProjectRemovals: ProjectRemovalFailure[] = []
      for (const projectId of targets.projectIds) {
        const existedBeforeRemoval = get().repos.some((repo) => repo.id === projectId)
        try {
          if (existedBeforeRemoval) {
            await get().removeProject(projectId)
          }
        } catch (err) {
          console.error('Failed to remove contained project:', err)
        }
        const stillExists = get().repos.some((repo) => repo.id === projectId)
        if (stillExists) {
          failedProjectRemovals.push({
            projectId,
            reason: 'Project remained in Yiru after removeProject completed.'
          })
        } else {
          removedProjectIds.push(projectId)
        }
      }

      return {
        status: 'deleted-group',
        groupId,
        requestedProjectIds,
        removedProjectIds,
        failedProjectRemovals
      }
    },
    moveProjectToGroup: async (projectId, groupId, order) => {
      try {
        if (!findRepoForHost(get().repos, projectId, { settings: get().settings })) {
          return false
        }
        const target = getActiveRuntimeTarget(settingsForRepoOwner(get(), projectId))
        const moved = (
          await callRuntimeOrpc(
            target,
            (client) => client.projectGroup.moveProject,
            { repo: projectId, groupId, order },
            { timeoutMs: 15_000 }
          )
        ).repo
        if (!moved) {
          return false
        }
        const ownedMoved = repoWithFetchedOwner(moved, target)
        const movedHostId = getRepoExecutionHostId(ownedMoved)
        set((s) => {
          const nextRepos = s.repos.map((repo) =>
            repoMatchesHostIdentity(repo, projectId, movedHostId) ? ownedMoved : repo
          )
          return {
            repos: nextRepos,
            ...mergeProjectCompatibilityForHostRepoChange({
              previous: { projects: s.projects, projectHostSetups: s.projectHostSetups },
              nextRepos,
              hostId: movedHostId
            }),
            folderWorkspacePathStatuses: {}
          }
        })
        return true
      } catch (err) {
        console.error('Failed to move repo to group:', err)
        return false
      }
    }
  }
}
