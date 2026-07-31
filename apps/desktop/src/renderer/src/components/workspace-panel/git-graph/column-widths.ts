// Pure column-width model for the commit table. Kept free of React so the
// drag-resize handler in commit-table.tsx can compute the next width directly
// from a pointer delta instead of deriving it inside an effect.
export type GitGraphColumnId = 'description' | 'date' | 'author' | 'commit'

export type GitGraphColumnWidths = Record<GitGraphColumnId, number>

export const GIT_GRAPH_COLUMN_MIN_WIDTH = 60

export const DEFAULT_GIT_GRAPH_COLUMN_WIDTHS: GitGraphColumnWidths = {
  description: 320,
  date: 90,
  author: 120,
  commit: 84
}

export function clampGitGraphColumnWidth(width: number): number {
  return Math.max(GIT_GRAPH_COLUMN_MIN_WIDTH, Math.round(width))
}

export function resizeGitGraphColumn(
  widths: GitGraphColumnWidths,
  columnId: GitGraphColumnId,
  startWidth: number,
  deltaX: number
): GitGraphColumnWidths {
  return { ...widths, [columnId]: clampGitGraphColumnWidth(startWidth + deltaX) }
}
