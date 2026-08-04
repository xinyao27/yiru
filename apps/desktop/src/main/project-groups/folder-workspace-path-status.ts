import { stat as statLocalPath } from 'node:fs/promises'

import { LOCAL_EXECUTION_HOST_ID, normalizeExecutionHostId } from '@yiru/workbench-model/workspace'
import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '~shared/folder-workspace-path-status'
import type { FolderWorkspace, ProjectGroup } from '~shared/types'

type FolderWorkspacePathStatusStore = {
  getProjectGroups?: () => ProjectGroup[]
  getFolderWorkspaces?: () => FolderWorkspace[]
}

function pathStatErrorReason(error: unknown): 'missing' | 'unavailable' {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unavailable'
}

async function statFolderPath(path: string): Promise<FolderWorkspacePathStatus> {
  try {
    const stats = await statLocalPath(path)
    return stats.isDirectory()
      ? { path, exists: true }
      : { path, exists: false, reason: 'not-directory' }
  } catch (error) {
    return { path, exists: false, reason: pathStatErrorReason(error) }
  }
}

export async function getFolderWorkspacePathStatusForPath(
  folderPath: string
): Promise<FolderWorkspacePathStatus> {
  return statFolderPath(folderPath)
}

function resolveFolderWorkspaceStatusPath(args: {
  store: FolderWorkspacePathStatusStore
  request: FolderWorkspacePathStatusRequest
}): { path: string; executionHostId: string | null } {
  const { request } = args
  if (request.scope === 'project-group') {
    const group = args.store
      .getProjectGroups?.()
      .find((entry) => entry.id === request.projectGroupId)
    if (!group?.parentPath) {
      throw new Error('folder_workspace_path_scope_not_found')
    }
    return {
      path: group.parentPath,
      executionHostId: normalizeExecutionHostId(group.executionHostId)
    }
  }

  if (request.scope === 'path') {
    return { path: request.path, executionHostId: LOCAL_EXECUTION_HOST_ID }
  }

  const workspace = args.store
    .getFolderWorkspaces?.()
    .find((entry) => entry.id === request.folderWorkspaceId)
  if (!workspace) {
    throw new Error('folder_workspace_path_scope_not_found')
  }
  const group = args.store
    .getProjectGroups?.()
    .find((entry) => entry.id === workspace.projectGroupId)
  return {
    path: workspace.folderPath,
    executionHostId: normalizeExecutionHostId(group?.executionHostId)
  }
}

export async function getFolderWorkspacePathStatus(
  store: FolderWorkspacePathStatusStore,
  request: FolderWorkspacePathStatusRequest
): Promise<FolderWorkspacePathStatus> {
  const scope = resolveFolderWorkspaceStatusPath({ store, request })
  if (scope.executionHostId && scope.executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return { path: scope.path, exists: false, reason: 'unavailable' }
  }
  return getFolderWorkspacePathStatusForPath(scope.path)
}

export function assertFolderWorkspacePathUsable(status: FolderWorkspacePathStatus): void {
  if (status.exists) {
    return
  }
  if (status.reason === 'missing') {
    throw new Error(`folder_workspace_path_missing:${status.path}`)
  }
  if (status.reason === 'not-directory') {
    throw new Error(`folder_workspace_path_not_directory:${status.path}`)
  }
  throw new Error(`folder_workspace_path_unavailable:${status.path}`)
}
