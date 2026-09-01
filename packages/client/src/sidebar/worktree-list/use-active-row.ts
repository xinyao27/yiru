import { useState } from 'react'

import type { ActiveSurfaceVariant } from '../worktree-card'
import { PINNED_GROUP_KEY } from './groups'
import type { WorktreeItemRow } from './row-model'
import type { LegendWorktreeViewportProps } from './viewport-props'

export function useActiveRow(
  rows: LegendWorktreeViewportProps['rows'],
  activeWorktreeId: string | null
) {
  const [requested, setRequested] = useState<{ worktreeId: string; rowKey: string } | null>(null)
  const primary =
    requested?.worktreeId === activeWorktreeId &&
    rows.some(
      (row) =>
        row.type === 'item' &&
        row.worktree.id === requested.worktreeId &&
        row.rowKey === requested.rowKey
    )
      ? requested
      : null
  const hasNaturalRow =
    activeWorktreeId !== null &&
    rows.some(
      (row) =>
        row.type === 'item' &&
        row.worktree.id === activeWorktreeId &&
        row.sectionKey !== PINNED_GROUP_KEY
    )
  const getSurfaceVariant = (row: WorktreeItemRow): ActiveSurfaceVariant => {
    if (primary?.worktreeId === row.worktree.id) {
      return primary.rowKey === row.rowKey ? 'primary' : 'secondary'
    }
    return hasNaturalRow && row.sectionKey === PINNED_GROUP_KEY ? 'secondary' : 'primary'
  }
  return {
    primaryRowKey: primary?.worktreeId === activeWorktreeId ? primary.rowKey : undefined,
    getSurfaceVariant,
    activate: (worktreeId: string, rowKey: string | undefined) => {
      setRequested(rowKey ? { worktreeId, rowKey } : null)
    }
  }
}
