import { isAbsolute } from 'node:path'

import { LOCAL_EXECUTION_HOST_ID, normalizeExecutionHostId } from '@yiru/workbench-model/workspace'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatus,
  getFolderWorkspacePathStatusForPath
} from '~main/project-groups/folder-workspace-path-status'
import { scanNestedRepos } from '~main/project-groups/nested-repo-discovery'
import {
  beginTrackedNestedRepoScan,
  endTrackedNestedRepoScan,
  rememberCompletedNestedRepoScan
} from '~main/project-groups/nested-repo-scan-registry'
import {
  clearWorkspaceCleanupDismissals as clearWorkspaceCleanupDismissalsInStore,
  dismissWorkspaceCleanupCandidates as dismissWorkspaceCleanupCandidatesInStore,
  scanWorkspaceCleanup as runWorkspaceCleanupScan
} from '~main/workspace-cleanup/workspace-cleanup'
import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '~shared/folder-workspace-path-status'
import type { Repo, NestedRepoScanResult, FolderWorkspace } from '~shared/types'
import type {
  WorkspaceCleanupDismissal,
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanResult
} from '~shared/workspace/cleanup'

import { RuntimeRepositoryListRepos } from './list-repos'

export abstract class RuntimeRepositoryMoveProjectToGroup extends RuntimeRepositoryListRepos {
  async moveProjectToGroup(
    repoSelector: string,
    groupId: string | null,
    order?: number
  ): Promise<Repo> {
    if (!this.store?.moveProjectToGroup) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    const moved = this.store.moveProjectToGroup(repo.id, groupId, order)
    if (!moved) {
      throw new Error('repo_not_found')
    }
    this.notifyReposChanged()
    return moved
  }

  async createFolderWorkspace(input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
    connectionId?: string | null
    linkedReview?: FolderWorkspace['linkedReview']
    createdWithAgent?: FolderWorkspace['createdWithAgent']
    pendingFirstAgentMessageRename?: boolean
  }): Promise<FolderWorkspace> {
    if (!this.store?.createFolderWorkspace) {
      throw new Error('runtime_unavailable')
    }
    const projectGroups = this.store.getProjectGroups?.() ?? []
    const group = projectGroups.find((entry) => entry.id === input.projectGroupId)
    const folderPath =
      typeof input.folderPath === 'string' && input.folderPath.trim().length > 0
        ? input.folderPath
        : group?.parentPath
    if (!group || !folderPath) {
      throw new Error('folder_workspace_project_group_not_found')
    }
    if (
      (normalizeExecutionHostId(group.executionHostId) ?? LOCAL_EXECUTION_HOST_ID) !==
      LOCAL_EXECUTION_HOST_ID
    ) {
      throw new Error('folder_workspace_project_group_not_local')
    }
    const status = await getFolderWorkspacePathStatusForPath(folderPath)
    assertFolderWorkspacePathUsable(status)
    const workspace = this.store.createFolderWorkspace(input)
    this.notifyReposChanged()
    return workspace
  }

  async getFolderWorkspacePathStatus(
    request: FolderWorkspacePathStatusRequest
  ): Promise<FolderWorkspacePathStatus> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    return getFolderWorkspacePathStatus(this.store, request)
  }

  async updateFolderWorkspace(
    folderWorkspaceId: string,
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
  ): Promise<FolderWorkspace | null> {
    if (!this.store?.updateFolderWorkspace) {
      throw new Error('runtime_unavailable')
    }
    if (typeof updates.folderPath === 'string' && updates.folderPath.trim().length > 0) {
      const workspace = this.store
        .getFolderWorkspaces?.()
        .find((entry) => entry.id === folderWorkspaceId)
      if (!workspace) {
        return null
      }
      const group = this.store
        .getProjectGroups?.()
        .find((entry) => entry.id === workspace.projectGroupId)
      if (
        (normalizeExecutionHostId(group?.executionHostId) ?? LOCAL_EXECUTION_HOST_ID) !==
        LOCAL_EXECUTION_HOST_ID
      ) {
        throw new Error('folder_workspace_project_group_not_local')
      }
      const status = await getFolderWorkspacePathStatusForPath(updates.folderPath)
      assertFolderWorkspacePathUsable(status)
    }
    const updated = this.store.updateFolderWorkspace(folderWorkspaceId, updates)
    if (updated) {
      this.notifyReposChanged()
    }
    return updated
  }

  async deleteFolderWorkspace(folderWorkspaceId: string): Promise<{ deleted: boolean }> {
    if (!this.store?.removeFolderWorkspace) {
      throw new Error('runtime_unavailable')
    }
    const deleted = this.store.removeFolderWorkspace(folderWorkspaceId)
    if (deleted) {
      this.notifyReposChanged()
    }
    return { deleted }
  }

  async scanNestedRepos(
    path: string,
    requestOptions?: { scanId?: string; options?: unknown }
  ): Promise<NestedRepoScanResult> {
    if (!isAbsolute(path)) {
      throw new Error('Project path must be an absolute path')
    }
    const scanId = requestOptions?.scanId
    const controller = beginTrackedNestedRepoScan(scanId)
    try {
      const scan = await scanNestedRepos({
        path,
        options: requestOptions?.options ?? { timeoutMs: 15_000 },
        signal: controller?.signal,
        onProgress: scanId
          ? (progress) =>
              this.emitNestedRepoScanProgressEvent({
                type: 'nestedRepoScanProgress',
                scanId,
                scan: progress
              })
          : undefined
      })
      rememberCompletedNestedRepoScan(scanId, scan)
      return scan
    } finally {
      endTrackedNestedRepoScan(scanId, controller)
    }
  }

  async scanWorkspaceCleanup(args: WorkspaceCleanupScanArgs): Promise<WorkspaceCleanupScanResult> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    return runWorkspaceCleanupScan(this.store, args, {
      onProgress: args.scanId
        ? (progress) => this.emitWorkspaceCleanupScanProgressEvent(progress)
        : undefined
    })
  }

  dismissWorkspaceCleanupCandidates(
    dismissals: readonly WorkspaceCleanupDismissal[]
  ): Record<string, WorkspaceCleanupDismissal> {
    const store = this.store
    if (!store?.getUI || !store.updateUI) {
      throw new Error('runtime_unavailable')
    }
    // Why: bind rather than pass the bare method — `Store#getUI`/`#updateUI`
    // read `this.state`, so a detached reference called without `store` as
    // its receiver would throw.
    const getUI = store.getUI.bind(store)
    const updateUI = store.updateUI.bind(store)
    return dismissWorkspaceCleanupCandidatesInStore(getUI, updateUI, dismissals)
  }

  clearWorkspaceCleanupDismissals(): Record<string, WorkspaceCleanupDismissal> {
    const store = this.store
    if (!store?.updateUI) {
      throw new Error('runtime_unavailable')
    }
    return clearWorkspaceCleanupDismissalsInStore(store.updateUI.bind(store))
  }
}
