import type { SourceControlRemoteOpKind } from '@yiru/workbench-model/review'

import type { RpcClient } from '../transport/rpc-client'
import { callRuntimeOrpc } from '../transport/runtime-orpc-client'
import { markMobileRemoteOperationError } from './operation'
import { recoverMobileRejectedPush } from './rejected-push-recovery'

export async function recoverMobileHostedReviewRejectedPush({
  client,
  worktreeId,
  error,
  operation,
  onStatusRefresh
}: {
  client: Pick<RpcClient, 'orpc'>
  worktreeId: string
  error: string
  operation: SourceControlRemoteOpKind
  onStatusRefresh: () => void | Promise<void>
}): Promise<boolean> {
  const operationError = markMobileRemoteOperationError(new Error(error), operation)
  return await recoverMobileRejectedPush({
    actionId: 'create-pr',
    error: operationError,
    gitFetch: () =>
      callRuntimeOrpc(client, (runtime) => runtime.git.fetch, {
        worktree: `id:${worktreeId}`
      }),
    loadStatus: async () => {
      await onStatusRefresh()
      return true
    }
  })
}
