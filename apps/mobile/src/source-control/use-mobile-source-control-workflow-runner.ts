import { useCallback, type MutableRefObject } from 'react'

import { triggerError, triggerSuccess } from '../platform/haptics'
import type { RecordMobileCommitFailure } from './mobile-commit-failure-recovery'
import {
  applyMobileHostedReviewRefresh,
  resolveMobileSourceControlOperationFollowUp,
  type RunMobileSourceControlWorkflow
} from './mobile-source-control-operation'
import { recoverMobileRejectedPush } from './mobile-source-control-rejected-push-recovery'
import type { LoadStatusOptions } from './mobile-source-control-screen-state'

type SendGitRequest = <T>(method: string, params?: Record<string, unknown>) => Promise<T>

type Params = {
  sendGitRequest: SendGitRequest
  loadStatus: (options?: LoadStatusOptions) => Promise<boolean>
  mountedRef: MutableRefObject<boolean>
  busyActionRef: MutableRefObject<string | null>
  setBusyAction: (next: string | null) => void
  setActionError: (next: string | null) => void
  setCommitMessage: (next: string) => void
  recordCommitFailure: RecordMobileCommitFailure
  onHostedReviewRefresh?: () => void
}

export function useMobileSourceControlWorkflowRunner({
  sendGitRequest,
  loadStatus,
  mountedRef,
  busyActionRef,
  setBusyAction,
  setActionError,
  setCommitMessage,
  recordCommitFailure,
  onHostedReviewRefresh
}: Params): RunMobileSourceControlWorkflow {
  return useCallback(
    async (actionId, runner, options) => {
      if (busyActionRef.current) {
        return false
      }
      busyActionRef.current = actionId
      setBusyAction(actionId)
      setActionError(null)
      recordCommitFailure(null)
      try {
        const result = await runner()
        if (!mountedRef.current) {
          return false
        }
        if (options?.clearCommitMessage) {
          setCommitMessage('')
        }
        triggerSuccess()
        const followUp = resolveMobileSourceControlOperationFollowUp(actionId, 'succeeded', result)
        await loadStatus({
          preserveReadyOnFailure:
            followUp === null || followUp.statusRefresh === 'preserve_previous',
          force: true
        })
        applyMobileHostedReviewRefresh(actionId, followUp, onHostedReviewRefresh)
        return true
      } catch (error) {
        if (!mountedRef.current) {
          return false
        }
        triggerError()
        setActionError(error instanceof Error ? error.message : 'Source control action failed')
        await recoverMobileRejectedPush({ actionId, error, sendGitRequest, loadStatus })
        return false
      } finally {
        if (busyActionRef.current === actionId) {
          busyActionRef.current = null
          if (mountedRef.current) {
            setBusyAction(null)
          }
        }
      }
    },
    [
      busyActionRef,
      loadStatus,
      mountedRef,
      onHostedReviewRefresh,
      recordCommitFailure,
      sendGitRequest,
      setActionError,
      setBusyAction,
      setCommitMessage
    ]
  )
}
