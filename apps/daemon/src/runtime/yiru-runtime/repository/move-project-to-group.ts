import { isAbsolute } from 'node:path'

import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '@yiru/runtime-protocol/workbench/folder-workspace-path-status'
import type {
  Repo,
  NestedRepoScanResult,
  FolderWorkspace
} from '@yiru/runtime-protocol/workbench/types'
import type {
  WorkspaceCleanupDismissal,
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanResult
} from '@yiru/runtime-protocol/workbench/workspace/cleanup'
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

import type { RepositoryServiceContext } from './service-context'

export const moveProjectToGroupMethods = {
  async moveProjectToGroup(
    repoSelector: string,
    groupId: string | null,
    order?: number
  ): Promise<Repo> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const moved = this.store.moveProjectToGroup(repo.id, groupId, order)
    if (!moved) {
      throw new Error('repo_not_found')
    }
    this.notifyReposChanged()
    return moved
  },

  async createFolderWorkspace(input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
    connectionId?: string | null
    linkedReview?: FolderWorkspace['linkedReview']
    createdWithAgent?: FolderWorkspace['createdWithAgent']
    pendingFirstAgentMessageRename?: boolean
  }): Promise<FolderWorkspace> {
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
  },

  async getFolderWorkspacePathStatus(
    request: FolderWorkspacePathStatusRequest
  ): Promise<FolderWorkspacePathStatus> {
    return getFolderWorkspacePathStatus(this.store, request)
  },

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
  },

  async deleteFolderWorkspace(folderWorkspaceId: string): Promise<{ deleted: boolean }> {
    const deleted = this.store.removeFolderWorkspace(folderWorkspaceId)
    if (deleted) {
      this.notifyReposChanged()
    }
    return { deleted }
  },

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
  },

  async scanWorkspaceCleanup(args: WorkspaceCleanupScanArgs): Promise<WorkspaceCleanupScanResult> {
    return runWorkspaceCleanupScan(this.store, args, {
      onProgress: args.scanId
        ? (progress) => this.emitWorkspaceCleanupScanProgressEvent(progress)
        : undefined
    })
  },

  dismissWorkspaceCleanupCandidates(
    dismissals: readonly WorkspaceCleanupDismissal[]
  ): Record<string, WorkspaceCleanupDismissal> {
    const store = this.store
    // Why: bind rather than pass the bare method — `Store#getUI`/`#updateUI`
    // read `this.state`, so a detached reference called without `store` as
    // its receiver would throw.
    const getUI = store.getUI.bind(store)
    const updateUI = store.updateUI.bind(store)
    return dismissWorkspaceCleanupCandidatesInStore(getUI, updateUI, dismissals)
  },

  clearWorkspaceCleanupDismissals(): Record<string, WorkspaceCleanupDismissal> {
    const store = this.store
    return clearWorkspaceCleanupDismissalsInStore(store.updateUI.bind(store))
  }
} satisfies ThisType<RepositoryServiceContext>
