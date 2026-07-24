import { describe, expect, it, vi } from 'vite-plus/test'

import type { WorktreeMeta } from '../shared/types'
import { persistExistingWorktreeSortOrder } from './worktree-sort-order-persistence'

describe('persistExistingWorktreeSortOrder', () => {
  it('updates existing metadata without minting a stale worktree row', () => {
    const existing = new Set(['live-a', 'live-b'])
    const setWorktreeMeta = vi.fn(
      (_worktreeId: string, _updates: Partial<WorktreeMeta>) => ({}) as WorktreeMeta
    )

    const updated = persistExistingWorktreeSortOrder(
      {
        getWorktreeMeta: (worktreeId) =>
          existing.has(worktreeId) ? ({} as WorktreeMeta) : undefined,
        setWorktreeMeta
      },
      ['live-a', 'stale', 'live-b'],
      10_000
    )

    expect(updated).toBe(2)
    expect(setWorktreeMeta).toHaveBeenCalledTimes(2)
    expect(setWorktreeMeta).toHaveBeenNthCalledWith(1, 'live-a', { sortOrder: 10_000 })
    expect(setWorktreeMeta).toHaveBeenNthCalledWith(2, 'live-b', { sortOrder: 8_000 })
  })
})
