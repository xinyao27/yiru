import { getRepoExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import { getNextProjectGroupOrder } from '@yiru/runtime-protocol/workbench/project-groups'
import type { Repo, FolderWorkspace } from '@yiru/runtime-protocol/workbench/types'
import { folderWorkspaceKey } from '@yiru/runtime-protocol/workbench/workspace/scope'
import { normalizeFolderWorkspaceName } from '~main/folder-workspaces'
import { removeWorkspaceSessionOwner } from '~main/persisted-state/workspace-session-owner-removal'

import { PersistenceSlice } from '../slice'

export class FolderWorkspaceSlice extends PersistenceSlice {
  updateFolderWorkspace(
    id: string,
    updates: Partial<
      Pick<
        FolderWorkspace,
        | 'name'
        | 'folderPath'
        | 'linkedReview'
        | 'comment'
        | 'isArchived'
        | 'isUnread'
        | 'isPinned'
        | 'sortOrder'
        | 'manualOrder'
        | 'workspaceStatus'
        | 'createdWithAgent'
        | 'pendingFirstAgentMessageRename'
        | 'firstAgentMessageRenameError'
        | 'lastActivityAt'
      >
    >
  ): FolderWorkspace | null {
    const workspace = this.callStore<FolderWorkspace | undefined>('getFolderWorkspace', id)
    if (!workspace) {
      return null
    }
    if (updates.name !== undefined) {
      workspace.name = normalizeFolderWorkspaceName(updates.name, workspace.name)
    }
    if (typeof updates.folderPath === 'string' && updates.folderPath.trim().length > 0) {
      workspace.folderPath = updates.folderPath
    }
    if (updates.linkedReview !== undefined) {
      workspace.linkedReview = updates.linkedReview
    }
    if (updates.comment !== undefined) {
      workspace.comment = updates.comment
    }
    if (updates.isArchived !== undefined) {
      workspace.isArchived = updates.isArchived
    }
    if (updates.isUnread !== undefined) {
      workspace.isUnread = updates.isUnread
    }
    if (updates.isPinned !== undefined) {
      workspace.isPinned = updates.isPinned
    }
    if (updates.sortOrder !== undefined && Number.isFinite(updates.sortOrder)) {
      workspace.sortOrder = updates.sortOrder
    }
    if (updates.manualOrder !== undefined) {
      if (Number.isFinite(updates.manualOrder)) {
        workspace.manualOrder = updates.manualOrder
      } else {
        delete workspace.manualOrder
      }
    }
    if (updates.workspaceStatus !== undefined) {
      workspace.workspaceStatus = updates.workspaceStatus
    }
    if (updates.createdWithAgent !== undefined) {
      workspace.createdWithAgent = updates.createdWithAgent
    }
    if (updates.pendingFirstAgentMessageRename !== undefined) {
      workspace.pendingFirstAgentMessageRename = updates.pendingFirstAgentMessageRename
    }
    if (updates.firstAgentMessageRenameError !== undefined) {
      workspace.firstAgentMessageRenameError = updates.firstAgentMessageRenameError
    }
    if (updates.lastActivityAt !== undefined && Number.isFinite(updates.lastActivityAt)) {
      workspace.lastActivityAt = updates.lastActivityAt
    }
    workspace.updatedAt = Date.now()
    this.scheduleSave('projects')
    return workspace
  }

  removeFolderWorkspace(id: string): boolean {
    const before = this.state.folderWorkspaces?.length ?? 0
    this.state.folderWorkspaces = (this.state.folderWorkspaces ?? []).filter(
      (workspace) => workspace.id !== id
    )
    if ((this.state.folderWorkspaces?.length ?? 0) === before) {
      return false
    }
    this.state.workspaceSession = removeWorkspaceSessionOwner(
      this.state.workspaceSession,
      folderWorkspaceKey(id)
    )!
    this.callStore<void>('removeWorkspaceLineageForFolderParent', id)
    this.scheduleSave('projects')
    return true
  }

  moveProjectToGroup(repoId: string, groupId: string | null, order?: number): Repo | null {
    const repo = this.state.repos.find((entry) => entry.id === repoId)
    if (!repo) {
      return null
    }
    const normalizedGroupId =
      groupId && (this.state.projectGroups ?? []).some((group) => group.id === groupId)
        ? groupId
        : null
    const siblingRepos = this.state.repos.filter((entry) => entry.id !== repoId)
    repo.projectGroupId = normalizedGroupId
    repo.projectGroupOrder =
      typeof order === 'number' && Number.isFinite(order)
        ? order
        : getNextProjectGroupOrder(siblingRepos, normalizedGroupId)
    this.scheduleSave('projects')
    return this.callStore<Repo>('hydrateRepo', repo)
  }

  addRepo(repo: Repo): void {
    this.state.repos.push(repo)
    this.callStore<void>('syncProjectHostSetupCompatibilityState')
    this.scheduleSave('projects')
  }

  // Why: returns false on a stale permutation (concurrent add/remove races
  // the renderer's drag) so the caller can tell the renderer to resync rather
  // than persist an order that drops or duplicates ids.
  reorderRepos(orderedIds: string[]): boolean {
    const current = this.state.repos
    if (orderedIds.length !== current.length) {
      return false
    }
    const seen = new Set<string>()
    for (const id of orderedIds) {
      if (typeof id !== 'string' || seen.has(id)) {
        return false
      }
      seen.add(id)
    }
    const byId = new Map<string, Repo>()
    for (const r of current) {
      byId.set(r.id, r)
    }
    const next: Repo[] = []
    for (const id of orderedIds) {
      const repo = byId.get(id)
      if (!repo) {
        return false
      }
      next.push(repo)
    }
    this.state.repos = next
    this.callStore<void>('syncProjectHostSetupCompatibilityState')
    this.scheduleSave('projects')
    return true
  }

  // Why: repo ids are unique only within an execution host, and renderer drags
  // persist one complete permutation per host when local and SSH repos coexist.
  reorderReposForHost(orderedIds: string[], hostId: ExecutionHostId): boolean {
    const current = this.state.repos
    const hostRepos = current.filter((repo) => getRepoExecutionHostId(repo) === hostId)
    if (orderedIds.length !== hostRepos.length) {
      return false
    }
    const byId = new Map(hostRepos.map((repo) => [repo.id, repo]))
    if (byId.size !== hostRepos.length) {
      return false
    }
    const seen = new Set<string>()
    const reorderedHostRepos: Repo[] = []
    for (const id of orderedIds) {
      const repo = typeof id === 'string' && !seen.has(id) ? byId.get(id) : undefined
      if (!repo) {
        return false
      }
      seen.add(id)
      reorderedHostRepos.push(repo)
    }
    let nextHostIndex = 0
    this.state.repos = current.map((repo) =>
      getRepoExecutionHostId(repo) === hostId ? reorderedHostRepos[nextHostIndex++] : repo
    )
    this.callStore<void>('syncProjectHostSetupCompatibilityState')
    this.scheduleSave('projects')
    return true
  }

  removeProject(id: string): void {
    this.state.repos = this.state.repos.filter((r) => r.id !== id)
    this.callStore<void>('syncProjectHostSetupCompatibilityState')
    // Why: presets are repo-scoped, so removing the repo means the presets
    // can never be referenced again — drop them with the parent.
    delete this.state.sparsePresetsByRepo[id]
    this.callStore<void>('pruneWorktreeStateForRepo', id, null)
    this.scheduleSave('projects')
  }

  // Why: the same repo id can exist on more than one execution host (local, an
  // SSH target, a re-added SSH target). Forgetting one host's copy must remove
  // only that host's repo row and worktree metadata — never the local or
  // another host's records that happen to share the id.
  removeProjectForHost(id: string, hostId: ExecutionHostId): void {
    this.state.repos = this.state.repos.filter(
      (r) => !(r.id === id && getRepoExecutionHostId(r) === hostId)
    )
    const idStillPresent = this.state.repos.some((r) => r.id === id)
    // Why: presets are repo-id-scoped (not host-scoped); only drop them once the
    // last host's copy of this repo is gone, or a surviving host loses its presets.
    if (!idStillPresent) {
      delete this.state.sparsePresetsByRepo[id]
    }
    this.callStore<void>('syncProjectHostSetupCompatibilityState')
    // Why: if the id survives on another host, prune only this host's worktree
    // metas; otherwise prune everything for the id (matches removeProject).
    this.callStore<void>('pruneWorktreeStateForRepo', id, idStillPresent ? hostId : null)
    this.scheduleSave('projects')
  }
}
