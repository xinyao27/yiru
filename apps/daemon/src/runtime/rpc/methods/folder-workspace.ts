import type {
  FolderWorkspaceCreateInput,
  FolderWorkspacePathStatusInput,
  FolderWorkspaceSelectorInput,
  FolderWorkspaceUpdateInput,
  RuntimeFolderWorkspaceDeleteResult,
  RuntimeFolderWorkspaceListResult,
  RuntimeFolderWorkspacePathStatusResult,
  RuntimeFolderWorkspaceResult,
  RuntimeNullableFolderWorkspaceResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext, RpcHandler } from '../core'
import { runProjectCatalogMutation } from './project-catalog-revision'

// Why: the contract leaf has no `.input()`, so oRPC infers `unknown` rather
// than `void` — direct wiring checks the handler against that real shape,
// unlike the legacy registry's erased `RpcMethod['handler']` (same class of
// gap as settings/ui's void→unknown fix, Phase 6 D-stage 切片 61).
export function handleFolderWorkspaceList(
  _params: unknown,
  { runtime, workspaceEventLog }: RpcContext
): RuntimeFolderWorkspaceListResult {
  return {
    folderWorkspaces: runtime.listFolderWorkspaces(),
    ...(workspaceEventLog ? { revision: workspaceEventLog.revision('project-catalog') } : {})
  }
}

export const handleFolderWorkspaceCreate = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({ folderWorkspace: await runtime.createFolderWorkspace(params) }),
    ({ folderWorkspace }) => ({
      kind: 'folder-workspace.created',
      payload: { folderWorkspaceId: folderWorkspace.id }
    })
  )) satisfies RpcHandler<FolderWorkspaceCreateInput, RuntimeFolderWorkspaceResult>

export const handleFolderWorkspaceUpdate = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({
      folderWorkspace: await runtime.updateFolderWorkspace(params.folderWorkspaceId, params.updates)
    }),
    ({ folderWorkspace }) =>
      folderWorkspace
        ? {
            kind: 'folder-workspace.updated',
            payload: { folderWorkspaceId: folderWorkspace.id }
          }
        : null
  )) satisfies RpcHandler<FolderWorkspaceUpdateInput, RuntimeNullableFolderWorkspaceResult>

export const handleFolderWorkspaceDelete = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => runtime.deleteFolderWorkspace(params.folderWorkspaceId),
    ({ deleted }) =>
      deleted
        ? {
            kind: 'folder-workspace.deleted',
            payload: { folderWorkspaceId: params.folderWorkspaceId }
          }
        : null
  )) satisfies RpcHandler<FolderWorkspaceSelectorInput, RuntimeFolderWorkspaceDeleteResult>

export const handleFolderWorkspaceGetPathStatus = (async (params, { runtime }) => ({
  status: await runtime.getFolderWorkspacePathStatus(params)
})) satisfies RpcHandler<FolderWorkspacePathStatusInput, RuntimeFolderWorkspacePathStatusResult>
