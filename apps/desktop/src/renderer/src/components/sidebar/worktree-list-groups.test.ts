import { describe, expect, it } from 'vite-plus/test'

import type { Worktree } from '../../../../shared/types'
import {
  buildRows,
  type GroupHeaderRow,
  type PinnedWorktreeDisplayPolicy
} from './worktree-list-groups'

const pinned = { id: 'pinned', repoId: 'repo', isPinned: true } as Worktree
const ordinary = { id: 'ordinary', repoId: 'repo', isPinned: false } as Worktree

function build(policy: PinnedWorktreeDisplayPolicy) {
  return buildRows({
    groupBy: 'none',
    worktrees: [pinned, ordinary],
    repoMap: new Map(),
    prCache: null,
    collapsedGroups: new Set(),
    pinnedDisplayPolicy: policy
  })
}

describe('pinned worktree display policy', () => {
  it('shows pinned worktrees only in Pinned by default', () => {
    const rows = build('single-location')
    expect(rows.filter((row) => row.type === 'item').map((row) => row.worktree.id)).toEqual([
      'pinned',
      'ordinary'
    ])
    expect(
      rows.find((row): row is GroupHeaderRow => row.type === 'header' && row.key === 'all')?.count
    ).toBe(1)
  })

  it('duplicates pinned worktrees into the original list when opted in', () => {
    const rows = build('duplicate-in-groups')
    expect(rows.filter((row) => row.type === 'item').map((row) => row.worktree.id)).toEqual([
      'pinned',
      'pinned',
      'ordinary'
    ])
    expect(
      rows.find((row): row is GroupHeaderRow => row.type === 'header' && row.key === 'all')?.count
    ).toBe(2)
  })
})
