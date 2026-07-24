import { describe, expect, it, vi } from 'vite-plus/test'

import type { RpcClient } from '../transport/rpc-client'
import { applyMobileHostedReviewRemotePrerequisite } from './mobile-hosted-review-remote-prerequisite'

describe('mobile hosted-review remote prerequisite', () => {
  it('fast-forwards a behind-only branch before creating a review', async () => {
    const sendRequest = vi.fn(async () => ({ ok: true, result: null }))
    const onProgress = vi.fn()

    await expect(
      applyMobileHostedReviewRemotePrerequisite(
        { sendRequest } as unknown as Pick<RpcClient, 'sendRequest'>,
        'worktree-1',
        {
          provider: 'github',
          base: 'main',
          title: 'Review title',
          body: '',
          canCreate: false,
          blockedReason: 'needs_sync'
        },
        {
          status: {
            entries: [],
            conflictOperation: 'unknown',
            branch: 'feature',
            upstreamStatus: { hasUpstream: true, ahead: 0, behind: 2 }
          },
          onProgress
        }
      )
    ).resolves.toEqual({ ok: true, ran: true })

    expect(onProgress).toHaveBeenCalledWith('fast_forwarding')
    expect(sendRequest).toHaveBeenCalledWith('git.fastForward', {
      worktree: 'id:worktree-1'
    })
  })
})
