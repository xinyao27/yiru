import { randomUUID } from 'node:crypto'

import { normalizeFolderWorkspaceName } from '~shared/folder-workspaces'
import {
  createProjectGroup,
  getProjectGroupSubtreeIds,
  normalizeProjectGroupName
} from '~shared/project-groups'
import type {
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult,
  Repo,
  ProjectGroup,
  FolderWorkspace
} from '~shared/types'
import { folderWorkspaceKey } from '~shared/workspace/scope'

import { removeWorkspaceSessionOwner } from './persisted-state/workspace-session-owner-removal'
import { StoreLayer1 } from './persistence-store-layer-1'

export abstract class StoreLayer2 extends StoreLayer1 {
  updateProjectHostSetup(args: ProjectHostSetupUpdateArgs): ProjectHostSetupUpdateResult | null {
    const setup = this.state.projectHostSetups.find((entry) => entry.id === args.setupId)
    if (!setup) {
      return null
    }
    const project = this.state.projects.find((entry) => entry.id === setup.projectId)
    if (!project) {
      return null
    }
    const repo = setup.repoId
      ? this.state.repos.find((entry) => entry.id === setup.repoId)
      : undefined
    if (repo) {
      const updated = this.updateRepoBackedProjectHostSetup(setup, repo, args.updates)
      const updatedProject = updated
        ? this.state.projects.find((entry) => entry.id === updated.setup.projectId)
        : undefined
      return updated && updatedProject
        ? { project: updatedProject, setup: updated.setup, repo: updated.repo }
        : null
    }
    const updatedSetup = this.updateIndependentProjectHostSetup(setup, args.updates)
    return { project, setup: updatedSetup }
  }

  deleteProjectHostSetup(args: ProjectHostSetupDeleteArgs): ProjectHostSetupDeleteResult | null {
    const setup = this.state.projectHostSetups.find((entry) => entry.id === args.setupId)
    if (!setup) {
      return null
    }
    const project = this.state.projects.find((entry) => entry.id === setup.projectId)
    if (!project) {
      return null
    }
    const repo = setup.repoId
      ? this.state.repos.find((entry) => entry.id === setup.repoId)
      : undefined
    if (repo) {
      this.removeProject(repo.id)
      return { project, setup, repo: this.hydrateRepo(repo) }
    }
    this.state.projectHostSetups = this.state.projectHostSetups.filter(
      (entry) => entry.id !== setup.id
    )
    this.scheduleSave()
    return { project, setup }
  }

  /**
   * O(1) read of the persisted repo count. Use this when you only need the
   * count (e.g. cohort-classifier) — `getRepos()` hydrates each repo, which
   * is wasteful when the caller only reads `.length`.
   */
  getRepoCount(): number {
    return this.state.repos.length
  }

  getRepo(id: string): Repo | undefined {
    const repo = this.state.repos.find((r) => r.id === id)
    return repo ? this.hydrateRepo(repo) : undefined
  }

  getProjectGroups(): ProjectGroup[] {
    return [...(this.state.projectGroups ?? [])].sort(
      (left, right) => left.tabOrder - right.tabOrder || left.name.localeCompare(right.name)
    )
  }

  createProjectGroup(input: {
    name: string
    parentPath?: string | null
    connectionId?: string | null
    parentGroupId?: string | null
    createdFrom: ProjectGroup['createdFrom']
  }): ProjectGroup {
    let maxOrder = -1
    // Why: persisted group lists can be large enough to exceed spread limits.
    for (const existingGroup of this.state.projectGroups ?? []) {
      maxOrder = Math.max(maxOrder, existingGroup.tabOrder)
    }
    const group = createProjectGroup({
      ...input,
      tabOrder: maxOrder + 1
    })
    this.state.projectGroups = [...(this.state.projectGroups ?? []), group]
    this.scheduleSave()
    return group
  }

  updateProjectGroup(
    groupId: string,
    updates: Partial<Pick<ProjectGroup, 'name' | 'isCollapsed' | 'tabOrder' | 'color'>>
  ): ProjectGroup | null {
    const group = (this.state.projectGroups ?? []).find((entry) => entry.id === groupId)
    if (!group) {
      return null
    }
    if (updates.name !== undefined) {
      group.name = normalizeProjectGroupName(updates.name, group.name)
    }
    if (updates.isCollapsed !== undefined) {
      group.isCollapsed = updates.isCollapsed
    }
    if (updates.tabOrder !== undefined && Number.isFinite(updates.tabOrder)) {
      group.tabOrder = updates.tabOrder
    }
    if (updates.color !== undefined) {
      group.color = typeof updates.color === 'string' ? updates.color : null
    }
    group.updatedAt = Date.now()
    this.scheduleSave()
    return group
  }

  deleteProjectGroup(groupId: string): boolean {
    const before = this.state.projectGroups?.length ?? 0
    const deletedGroupIds = getProjectGroupSubtreeIds(this.state.projectGroups ?? [], groupId)
    this.state.projectGroups = (this.state.projectGroups ?? []).filter(
      (group) => !deletedGroupIds.has(group.id)
    )
    if ((this.state.projectGroups?.length ?? 0) === before) {
      return false
    }
    // Why: groups are sidebar organization only. Deleting one must not delete
    // repos or worktrees, so contained repos from the full subtree are ungrouped.
    this.state.repos = this.state.repos.map((repo) =>
      repo.projectGroupId && deletedGroupIds.has(repo.projectGroupId)
        ? { ...repo, projectGroupId: null }
        : repo
    )
    for (const workspace of this.state.folderWorkspaces ?? []) {
      if (deletedGroupIds.has(workspace.projectGroupId)) {
        this.state.workspaceSession = removeWorkspaceSessionOwner(
          this.state.workspaceSession,
          folderWorkspaceKey(workspace.id)
        )!
        this.removeWorkspaceLineageForFolderParent(workspace.id)
      }
    }
    this.state.folderWorkspaces = (this.state.folderWorkspaces ?? []).filter(
      (workspace) => !deletedGroupIds.has(workspace.projectGroupId)
    )
    this.scheduleSave()
    return true
  }

  getFolderWorkspaces(): FolderWorkspace[] {
    return [...(this.state.folderWorkspaces ?? [])].sort(
      (left, right) => right.sortOrder - left.sortOrder || left.name.localeCompare(right.name)
    )
  }

  getFolderWorkspace(id: string): FolderWorkspace | undefined {
    return (this.state.folderWorkspaces ?? []).find((workspace) => workspace.id === id)
  }

  createFolderWorkspace(input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
    linkedReview?: FolderWorkspace['linkedReview']
    connectionId?: string | null
    createdWithAgent?: FolderWorkspace['createdWithAgent']
    pendingFirstAgentMessageRename?: boolean
  }): FolderWorkspace {
    const group = (this.state.projectGroups ?? []).find(
      (entry) => entry.id === input.projectGroupId
    )
    const folderPath =
      typeof input.folderPath === 'string' && input.folderPath.trim().length > 0
        ? input.folderPath
        : group?.parentPath
    if (!group || !folderPath) {
      throw new Error('Folder-backed project group not found.')
    }
    const now = Date.now()
    const workspace: FolderWorkspace = {
      id: randomUUID(),
      projectGroupId: group.id,
      name: normalizeFolderWorkspaceName(input.name, `${group.name} workspace`),
      folderPath,
      connectionId: input.connectionId ?? group.connectionId ?? null,
      linkedReview: input.linkedReview ?? null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: now,
      ...(input.createdWithAgent ? { createdWithAgent: input.createdWithAgent } : {}),
      ...(input.pendingFirstAgentMessageRename === true && input.createdWithAgent
        ? { pendingFirstAgentMessageRename: true }
        : {}),
      lastActivityAt: 0,
      createdAt: now,
      updatedAt: now
    }
    this.state.folderWorkspaces = [workspace, ...(this.state.folderWorkspaces ?? [])]
    this.scheduleSave()
    return workspace
  }
}
