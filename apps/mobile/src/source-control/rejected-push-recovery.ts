import {
  resolveSourceControlOperationFollowUp,
  resolveSourceControlRemoteOperationFailureOutcome
} from '@yiru/workbench-model/review'

import { getMobileSourceControlRemoteOperation, isMobileSyncPushStageError } from './operation'
import type { LoadStatusOptions } from './screen-state'

type LoadStatus = (options?: LoadStatusOptions) => Promise<boolean>

export async function recoverMobileRejectedPush({
  actionId,
  error,
  gitFetch,
  loadStatus
}: {
  actionId: string
  error: unknown
  gitFetch: () => Promise<unknown>
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
  await gitFetch().catch(() => undefined)
  await loadStatus({
    preserveReadyOnFailure: followUp.statusRefresh === 'preserve_previous',
    clearActionErrorOnSuccess: false,
    force: true
  })
  return true
}
