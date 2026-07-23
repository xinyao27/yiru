import { describe, expect, it, vi } from 'vite-plus/test'

import {
  applyMobileHostedReviewRefresh,
  getMobileSourceControlRemoteOperation,
  markMobileRemoteOperationError,
  resolveMobileSourceControlOperationFollowUp
} from './mobile-source-control-operation'
import { recoverMobileRejectedPush } from './mobile-source-control-rejected-push-recovery'

describe('mobile source-control operation follow-up', () => {
  it('refreshes hosted review state only after remote changes that can affect it', () => {
    const refresh = vi.fn()
    for (const actionId of ['push', 'force-push', 'publish']) {
      applyMobileHostedReviewRefresh(
        actionId,
        resolveMobileSourceControlOperationFollowUp(actionId, 'succeeded'),
        refresh
      )
    }
    applyMobileHostedReviewRefresh(
      'sync',
      resolveMobileSourceControlOperationFollowUp('sync', 'succeeded', { syncPushed: false }),
      refresh
    )
    applyMobileHostedReviewRefresh('create-pr', null, refresh)

    expect(refresh).toHaveBeenCalledTimes(4)

    applyMobileHostedReviewRefresh(
      'sync',
      resolveMobileSourceControlOperationFollowUp('sync', 'succeeded', { syncPushed: true }),
      refresh
    )
    expect(refresh).toHaveBeenCalledTimes(5)
  })

  it('recovers remote prerequisites hidden inside create-review intent', async () => {
    const error = markMobileRemoteOperationError(
      new Error('updates were rejected (non-fast-forward)'),
      'force_push'
    )
    const requests: string[] = []
    const sendGitRequest = async <T>(method: string): Promise<T> => {
      requests.push(method)
      return undefined as T
    }
    const loadStatus = vi.fn().mockResolvedValue(true)

    expect(
      await recoverMobileRejectedPush({
        actionId: 'create-pr',
        error,
        sendGitRequest,
        loadStatus
      })
    ).toBe(true)
    expect(getMobileSourceControlRemoteOperation('create-pr', error)).toBe('force_push')
    expect(requests).toEqual(['git.fetch'])
    expect(loadStatus).toHaveBeenCalledWith({
      preserveReadyOnFailure: true,
      clearActionErrorOnSuccess: false,
      force: true
    })
  })
})
