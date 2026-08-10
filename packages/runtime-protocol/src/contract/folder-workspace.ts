import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  FolderWorkspaceCreateInputSchema,
  FolderWorkspacePathStatusInputSchema,
  FolderWorkspaceSelectorInputSchema,
  FolderWorkspaceUpdateInputSchema
} from './folder-workspace-input.js'
import type {
  RuntimeFolderWorkspaceDeleteResult,
  RuntimeFolderWorkspaceListResult,
  RuntimeFolderWorkspacePathStatusResult,
  RuntimeFolderWorkspaceResult,
  RuntimeNullableFolderWorkspaceResult
} from './folder-workspace-types.js'

const PROJECT_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const PROJECT_HOST_ACCESS = { scope: 'project', tier: 'host' } as const
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE = { mobile: true } as const

export const folderWorkspaceContract = {
  list: withAccess(PROJECT_READ_ACCESS, MOBILE).output(type<RuntimeFolderWorkspaceListResult>()),
  create: withAccess(HOST_ACCESS)
    .input(FolderWorkspaceCreateInputSchema)
    .output(type<RuntimeFolderWorkspaceResult>()),
  update: withAccess(HOST_ACCESS)
    .input(FolderWorkspaceUpdateInputSchema)
    .output(type<RuntimeNullableFolderWorkspaceResult>()),
  delete: withAccess(PROJECT_HOST_ACCESS)
    .input(FolderWorkspaceSelectorInputSchema)
    .output(type<RuntimeFolderWorkspaceDeleteResult>()),
  getPathStatus: withAccess(HOST_ACCESS)
    .input(FolderWorkspacePathStatusInputSchema)
    .output(type<RuntimeFolderWorkspacePathStatusResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './folder-workspace-input.js'
export type * from './folder-workspace-types.js'
