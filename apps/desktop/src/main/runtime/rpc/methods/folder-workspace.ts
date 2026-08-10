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

// Why: the contract leaf has no `.input()`, so oRPC infers `unknown` rather
// than `void` — direct wiring checks the handler against that real shape,
// unlike the legacy registry's erased `RpcMethod['handler']` (same class of
// gap as settings/ui's void→unknown fix, Phase 6 D-stage 切片 61).
export function handleFolderWorkspaceList(
  _params: unknown,
  { runtime }: RpcContext
): RuntimeFolderWorkspaceListResult {
  return { folderWorkspaces: runtime.listFolderWorkspaces() }
}

export const handleFolderWorkspaceCreate = (async (params, { runtime }) => ({
  folderWorkspace: await runtime.createFolderWorkspace(params)
})) satisfies RpcHandler<FolderWorkspaceCreateInput, RuntimeFolderWorkspaceResult>

export const handleFolderWorkspaceUpdate = (async (params, { runtime }) => ({
  folderWorkspace: await runtime.updateFolderWorkspace(params.folderWorkspaceId, params.updates)
})) satisfies RpcHandler<FolderWorkspaceUpdateInput, RuntimeNullableFolderWorkspaceResult>

export const handleFolderWorkspaceDelete = (async (params, { runtime }) =>
  runtime.deleteFolderWorkspace(params.folderWorkspaceId)) satisfies RpcHandler<
  FolderWorkspaceSelectorInput,
  RuntimeFolderWorkspaceDeleteResult
>

export const handleFolderWorkspaceGetPathStatus = (async (params, { runtime }) => ({
  status: await runtime.getFolderWorkspacePathStatus(params)
})) satisfies RpcHandler<FolderWorkspacePathStatusInput, RuntimeFolderWorkspacePathStatusResult>
