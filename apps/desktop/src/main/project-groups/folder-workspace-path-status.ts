import { stat as statLocalPath } from 'node:fs/promises'

import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '~shared/folder-workspace-path-status'
import type { FolderWorkspace, ProjectGroup, Repo } from '~shared/types'

type FolderWorkspacePathStatusStore = {
  getRepos: () => Repo[]
  getProjectGroups?: () => ProjectGroup[]
  getFolderWorkspaces?: () => FolderWorkspace[]
}

export type FolderWorkspacePathConnectionResolution = { kind: 'local' }

export function inferFolderWorkspacePathConnection(args: {
  folderPath: string
  projectGroupId?: string | null
  connectionId?: string | null
  projectGroups: readonly ProjectGroup[]
  repos: readonly Repo[]
}): FolderWorkspacePathConnectionResolution {
  void args
  return { kind: 'local' }
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

export async function getFolderWorkspacePathStatusForPath(args: {
  folderPath: string
  projectGroupId?: string | null
  connectionId?: string | null
  projectGroups: readonly ProjectGroup[]
  repos: readonly Repo[]
}): Promise<FolderWorkspacePathStatus> {
  return statFolderPath(args.folderPath)
}

export function resolveFolderWorkspaceStatusPath(args: {
  store: FolderWorkspacePathStatusStore
  request: FolderWorkspacePathStatusRequest
}): { folderPath: string; projectGroupId: string | null; connectionId?: string | null } {
  const { request } = args
  if (request.scope === 'project-group') {
    const group = args.store
      .getProjectGroups?.()
      .find((entry) => entry.id === request.projectGroupId)
    if (!group?.parentPath) {
      throw new Error('folder_workspace_path_scope_not_found')
    }
    return {
      folderPath: group.parentPath,
      projectGroupId: group.id,
      connectionId: group.connectionId ?? null
    }
  }

  if (request.scope === 'path') {
    return {
      folderPath: request.path,
      projectGroupId: null,
      connectionId: request.connectionId ?? null
    }
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
    folderPath: workspace.folderPath,
    projectGroupId: workspace.projectGroupId,
    connectionId: workspace.connectionId ?? group?.connectionId ?? null
  }
}

export async function getFolderWorkspacePathStatus(
  store: FolderWorkspacePathStatusStore,
  request: FolderWorkspacePathStatusRequest
): Promise<FolderWorkspacePathStatus> {
  const scope = resolveFolderWorkspaceStatusPath({ store, request })
  return getFolderWorkspacePathStatusForPath({
    folderPath: scope.folderPath,
    projectGroupId: scope.projectGroupId,
    connectionId: scope.connectionId,
    projectGroups: store.getProjectGroups?.() ?? [],
    repos: store.getRepos()
  })
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
  if (status.reason === 'ambiguous-connection') {
    throw new Error(`folder_workspace_connection_ambiguous:${status.path}`)
  }
  throw new Error(`folder_workspace_path_unavailable:${status.path}`)
}
