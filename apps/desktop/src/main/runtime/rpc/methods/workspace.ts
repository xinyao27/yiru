import { z } from 'zod'

import {
  OptionalString,
  requiredString
} from '../../../../shared/runtime-method-contracts/runtime-method-params'
import { WorkspacePathOpenError } from '../../../workspace-path-opening'
import { InvalidArgumentError, defineMethod, type RpcMethod } from '../core'

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
