import type { RenderRow } from './worktree-list/virtual-rows'
import { estimateRenderRowSize } from './worktree-list/virtual-rows'

export type WorkspaceSidebarProjectedRow = {
  kind: 'local'
  key: string
  localIndex: number
  row: RenderRow
}

export function projectWorkspaceSidebarRows(args: {
  localRows: readonly RenderRow[]
  getLocalRowKey: (row: RenderRow) => string
}): WorkspaceSidebarProjectedRow[] {
  return args.localRows.map((row, localIndex) => ({
    kind: 'local',
    key: args.getLocalRowKey(row),
    localIndex,
    row
  }))
}

export function workspaceIndexForLocalRowIndex(
  rows: readonly WorkspaceSidebarProjectedRow[],
  localIndex: number
): number {
  return rows.findIndex((row) => row.localIndex === localIndex)
}

export function getWorkspaceSidebarRowKey(row: WorkspaceSidebarProjectedRow): string {
  return row.key
}

export function estimateWorkspaceSidebarRowSize(args: {
  rows: readonly WorkspaceSidebarProjectedRow[]
  localRows: readonly RenderRow[]
  index: number
  firstLocalHeaderIndex: number
  activeStickyHeaderIndex: number | null
}): number {
  const projected = args.rows[args.index]
  if (!projected) {
    return 32
  }
  return estimateRenderRowSize(
    args.localRows,
    projected.localIndex,
    args.firstLocalHeaderIndex,
    args.activeStickyHeaderIndex
  )
}
