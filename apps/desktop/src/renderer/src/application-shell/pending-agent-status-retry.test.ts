import { describe, expect, it, vi } from 'vite-plus/test'

import {
  hasRuntimeBackedAgentStatusAttribution,
  retryPendingAgentStatusEvents,
  type PendingAgentStatusEvent
} from './pending-agent-status-retry'

describe('pending agent status retry', () => {
  it('queues remote startup rows only when they carry runtime-backed worktree identity', () => {
    expect(
      hasRuntimeBackedAgentStatusAttribution({
        worktreeId: 'worktree-1',
        terminalHandle: 'terminal-1'
      })
    ).toBe(true)
    expect(hasRuntimeBackedAgentStatusAttribution({ worktreeId: 'worktree-1' })).toBe(false)
    expect(hasRuntimeBackedAgentStatusAttribution({ terminalHandle: 'terminal-1' })).toBe(false)
  })

  it('preserves startup replay semantics when hydration makes a pane available', () => {
    const apply = vi.fn(() => 'applied' as const)
    const event: PendingAgentStatusEvent<{ paneKey: string }> = {
      data: { paneKey: 'tab-1:leaf-1' },
      firstSeenAt: 100,
      replay: true
    }

    const remaining = retryPendingAgentStatusEvents([event], {
      now: 200,
      ttlMs: 15_000,
      apply
    })

    expect(remaining).toEqual([])
    expect(apply).toHaveBeenCalledWith(event.data, { retry: true, replay: true })
  })

  it('retains unresolved rows without retrying expired startup snapshots', () => {
    const apply = vi.fn(() => 'pending' as const)
    const pending: PendingAgentStatusEvent<{ paneKey: string }> = {
      data: { paneKey: 'tab-pending:leaf-1' },
      firstSeenAt: 100,
      replay: true
    }
    const expired: PendingAgentStatusEvent<{ paneKey: string }> = {
      data: { paneKey: 'tab-expired:leaf-1' },
      firstSeenAt: 0,
      replay: true
    }

    const remaining = retryPendingAgentStatusEvents([pending, expired], {
      now: 200,
      ttlMs: 150,
      apply
    })

    expect(remaining).toEqual([pending])
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
