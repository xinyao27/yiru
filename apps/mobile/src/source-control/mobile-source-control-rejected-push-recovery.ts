import {
  resolveSourceControlOperationFollowUp,
  resolveSourceControlRemoteOperationFailureOutcome
} from '@yiru/workbench-model/review'

import {
  getMobileSourceControlRemoteOperation,
  isMobileSyncPushStageError
} from './mobile-source-control-operation'
import type { LoadStatusOptions } from './mobile-source-control-screen-state'

type SendGitRequest = <T>(method: string, params?: Record<string, unknown>) => Promise<T>
type LoadStatus = (options?: LoadStatusOptions) => Promise<boolean>

export async function recoverMobileRejectedPush({
  actionId,
  error,
  sendGitRequest,
  loadStatus
}: {
  actionId: string
  error: unknown
  sendGitRequest: SendGitRequest
  loadStatus: LoadStatus
}): Promise<boolean> {
  const operation = getMobileSourceControlRemoteOperation(actionId, error)
  if (!operation) {
    return false
  }
  const followUp = resolveSourceControlOperationFollowUp({
    operation,
    outcome: resolveSourceControlRemoteOperationFailureOutcome({
      operation,
      error,
      isPushStage: operation !== 'sync' || isMobileSyncPushStageError(error)
    })
  })
  if (followUp.recovery !== 'fetch_then_refresh_upstream') {
    return false
  }

  // Why: mobile reads upstream state through git.status; recover on the same
  // paired runtime so SSH/WSL host ownership stays intact.
  await sendGitRequest<unknown>('git.fetch').catch(() => undefined)
  await loadStatus({
    preserveReadyOnFailure: followUp.statusRefresh === 'preserve_previous',
    clearActionErrorOnSuccess: false,
    force: true
  })
  return true
}
