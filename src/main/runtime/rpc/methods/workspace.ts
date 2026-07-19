import { z } from 'zod'
import { InvalidArgumentError, defineMethod, type RpcMethod } from '../core'
import { OptionalString, requiredString } from '../schemas'
import { WorkspacePathOpenError } from '../../../workspace-path-opening'

const WorkspaceOpenPath = z.object({
  path: requiredString('Missing workspace path'),
  contextWorktree: OptionalString
})

export const WORKSPACE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'workspace.openPath',
    params: WorkspaceOpenPath,
    handler: async (params, { runtime }) => {
      try {
        return await runtime.openWorkspacePath(params.path, params.contextWorktree)
      } catch (error) {
        if (error instanceof WorkspacePathOpenError) {
          throw new InvalidArgumentError(error.message)
        }
        throw error
      }
    }
  })
]
