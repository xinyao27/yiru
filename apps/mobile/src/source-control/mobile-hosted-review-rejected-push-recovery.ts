import type { SourceControlRemoteOpKind } from '@yiru/workbench-model/review'

import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import { markMobileRemoteOperationError } from './mobile-source-control-operation'
import { recoverMobileRejectedPush } from './mobile-source-control-rejected-push-recovery'

export async function recoverMobileHostedReviewRejectedPush({
  client,
  worktreeId,
  error,
  operation,
  onStatusRefresh
}: {
  client: Pick<RpcClient, 'sendRequest'>
  worktreeId: string
  error: string
  operation: SourceControlRemoteOpKind
  onStatusRefresh: () => void | Promise<void>
}): Promise<boolean> {
  const operationError = markMobileRemoteOperationError(new Error(error), operation)
  return await recoverMobileRejectedPush({
    actionId: 'create-pr',
    error: operationError,
    sendGitRequest: async <T>(method: string, params?: Record<string, unknown>) => {
      const response = await client.sendRequest(method, {
        worktree: `id:${worktreeId}`,
        ...params
      })
      if (!response.ok) {
        throw new Error(response.error?.message || 'Source control action failed')
      }
      return (response as RpcSuccess).result as T
    },
    loadStatus: async () => {
      await onStatusRefresh()
      return true
    }
  })
}
