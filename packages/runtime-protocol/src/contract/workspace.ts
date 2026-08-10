import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import { OptionalString, requiredString } from './input-schema.js'

const WORKSPACE_HOST_ACCESS = { scope: 'host', tier: 'host' } as const

export const WorkspaceOpenPathInputSchema = z.object({
  path: requiredString('Missing workspace path'),
  contextWorktree: OptionalString
})

export type WorkspaceOpenPathInput = z.output<typeof WorkspaceOpenPathInputSchema>

export type WorkspaceOpenPathResult = {
  requestedPath: string
  resolvedPath: string
  repoId: string
  worktreeId: string
  kind: 'git' | 'folder'
  disposition: 'activated' | 'added'
}

export const workspaceContract = {
  openPath: withAccess(WORKSPACE_HOST_ACCESS)
    .input(WorkspaceOpenPathInputSchema)
    .output(type<WorkspaceOpenPathResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
