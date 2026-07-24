import { describe, expect, it } from 'vite-plus/test'

import type { Worktree } from '../../../../shared/types'
import type { WorktreeRow } from './worktree-list-groups'
import { getPreferredWorktreeRows } from './worktree-sidebar-row-preference'

function row(worktreeId: string, sectionKey: string): WorktreeRow {
  return {
    type: 'item',
    rowKey: `${sectionKey}:${worktreeId}`,
    sectionKey,
    worktree: { id: worktreeId } as Worktree,
    repo: undefined,
    depth: 0,
    groupDepth: 0,
    lineageTrail: [],
    isLastLineageChild: false,
    lineageChildCount: 0
  }
}

describe('getPreferredWorktreeRows', () => {
  it('prefers a duplicated pinned workspace natural row for navigation', () => {
    const pinned = row('one', 'pinned')
    const natural = row('one', 'project:one')
    expect(getPreferredWorktreeRows([pinned, natural], 'duplicate-in-groups')).toEqual([natural])
  })

  it('falls back to the pinned row when its natural group is hidden', () => {
    const pinned = row('one', 'pinned')
    expect(getPreferredWorktreeRows([pinned], 'duplicate-in-groups')).toEqual([pinned])
  })
})
