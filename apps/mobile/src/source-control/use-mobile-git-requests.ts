import {
  resolveSourceControlSyncAfterPull,
  resolveSourceControlSyncStart
} from '@yiru/workbench-model/review'
import { useCallback } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcSuccess } from '../transport/types'
import {
  isMobileGitUnavailable,
  type MobileGitStatusResult,
  type MobileGitUpstreamStatus
} from './mobile-git-status'
import {
  markMobileSyncPushStageError,
  type MobileSourceControlWorkflowResult
} from './mobile-source-control-operation'
import type { GitCommitResult, GitRequestError } from './mobile-source-control-screen-state'

type Params = {
  client: RpcClient | null
  connState: ConnectionState
  worktreeId: string
}

// The raw RPC layer for source-control git actions. Pure transport — owns no
// screen state, so it stays out of the giant state hook.
export function useMobileGitRequests({ client, connState, worktreeId }: Params) {
  const sendGitRequest = useCallback(
    async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
      if (!client || connState !== 'connected') {
        throw new Error('Waiting for desktop...')
      }
      const response = await client.sendRequest(method, {
        worktree: `id:${worktreeId}`,
        ...params
      })
      if (!response.ok) {
        const error = new Error(
          response.error?.message || 'Source control action failed'
        ) as GitRequestError
        error.code = response.error?.code
        throw error
      }
      return (response as RpcSuccess).result as T
    },
    [client, connState, worktreeId]
  )

  const sendCommitRequest = useCallback(
    async (message: string): Promise<GitCommitResult> => {
      const result = await sendGitRequest<GitCommitResult>('git.commit', { message })
      if (!result || result.success !== true) {
        throw new Error(result?.error || 'Commit failed')
      }
      return result
    },
    [sendGitRequest]
  )

  const readUpstreamStatusForSync = useCallback(async (): Promise<MobileGitUpstreamStatus> => {
    try {
      return await sendGitRequest<MobileGitUpstreamStatus>('git.upstreamStatus')
    } catch (err) {
      const code = err instanceof Error ? (err as GitRequestError).code : undefined
      const message = err instanceof Error ? err.message : String(err)
      if (!isMobileGitUnavailable(code, message)) {
        throw err
      }
      const status = await sendGitRequest<MobileGitStatusResult>('git.status')
      if (!status.upstreamStatus) {
        throw new Error('Branch status unavailable')
      }
      return status.upstreamStatus
    }
  }, [sendGitRequest])

  const runGitSyncSteps = useCallback(async (): Promise<MobileSourceControlWorkflowResult> => {
    await sendGitRequest<unknown>('git.fetch')
    const upstreamBeforePull = await readUpstreamStatusForSync()
    if (resolveSourceControlSyncStart(upstreamBeforePull) === 'force_push') {
      try {
        await sendGitRequest<unknown>('git.push', { forceWithLease: true })
      } catch (error) {
        throw markMobileSyncPushStageError(error)
      }
      return { syncPushed: true }
    }
    await sendGitRequest<unknown>('git.pull')
    const upstreamAfterPull = await readUpstreamStatusForSync()
    if (resolveSourceControlSyncAfterPull(upstreamAfterPull) === 'push') {
      try {
        await sendGitRequest<unknown>('git.push')
      } catch (error) {
        throw markMobileSyncPushStageError(error)
      }
      return { syncPushed: true }
    }
    return { syncPushed: false }
  }, [readUpstreamStatusForSync, sendGitRequest])

  return { sendGitRequest, sendCommitRequest, runGitSyncSteps }
}
