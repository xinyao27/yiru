import type {
  WorkspaceOpenPathInput,
  WorkspaceOpenPathResult
} from '@yiru/runtime-protocol/contract'
import { WorkspacePathOpenError } from '~main/workspace-path-opening'

import { InvalidArgumentError, type RpcContext } from '../core'

export async function openRuntimeWorkspacePath(
  params: WorkspaceOpenPathInput,
  { runtime }: RpcContext
): Promise<WorkspaceOpenPathResult> {
  try {
    return await runtime.openWorkspacePath(params.path, params.contextWorktree)
  } catch (error) {
    if (error instanceof WorkspacePathOpenError) {
      throw new InvalidArgumentError(error.message)
    }
    throw error
  }
}
