import { defaultRangeExtractor, type Range } from '@tanstack/react-virtual'
import type { RenderRow } from './worktree-list-virtual-rows'
import {
  estimateRenderRowSize,
  extractWorktreeVirtualRowIndexes
} from './worktree-list-virtual-rows'
import type { SpoolSidebarRow } from './spool-sidebar-rows'
import {
  projectSpoolAvailabilityDiagnostic,
  type SpoolAvailabilityDiagnostic
} from '@/components/spool/spool-availability-diagnostic'

export type WorkspaceSidebarProjectedRow =
  | {
      kind: 'local'
      key: string
      localIndex: number
      row: RenderRow
    }
  | {
      kind: 'spool-section'
      key: 'spool:section'
    }
  | {
      kind: 'spool-windows-firewall'
      key: 'spool:windows-firewall'
    }
  | {
      kind: 'spool-availability'
      key: 'spool:availability'
      diagnostic: SpoolAvailabilityDiagnostic
    }
  | {
      kind: 'spool'
      key: string
      row: SpoolSidebarRow
    }

export function shouldShowSpoolWindowsFirewallDiagnostic(
  status: 'starting' | 'ready' | 'unavailable',
  diagnostic: string | null
): boolean {
  return status === 'unavailable' && diagnostic === 'spool_windows_firewall_unavailable'
}

export function shouldShowSpoolAvailabilityDiagnostic(
  status: 'starting' | 'ready' | 'unavailable',
  diagnostic: string | null
): boolean {
  return projectSpoolAvailabilityDiagnostic(status, diagnostic) !== null
}

export function projectWorkspaceSidebarRows(args: {
  localRows: readonly RenderRow[]
  spoolRows: readonly SpoolSidebarRow[]
  spoolStatus: 'starting' | 'ready' | 'unavailable'
  spoolDiagnostic: string | null
  getLocalRowKey: (row: RenderRow) => string
}): WorkspaceSidebarProjectedRow[] {
  const rows: WorkspaceSidebarProjectedRow[] = args.localRows.map((row, localIndex) => ({
    kind: 'local',
    key: args.getLocalRowKey(row),
    localIndex,
    row
  }))
  const showWindowsFirewall = shouldShowSpoolWindowsFirewallDiagnostic(
    args.spoolStatus,
    args.spoolDiagnostic
  )
  const availabilityDiagnostic = projectSpoolAvailabilityDiagnostic(
    args.spoolStatus,
    args.spoolDiagnostic
  )
  if (args.spoolRows.length === 0 && !showWindowsFirewall && !availabilityDiagnostic) {
    return rows
  }
  // Why: Spool resources are a separate remote namespace; placing their
  // section after local rows avoids interleaving opaque refs with local hosts.
  rows.push({ kind: 'spool-section', key: 'spool:section' })
  if (showWindowsFirewall) {
    rows.push({ kind: 'spool-windows-firewall', key: 'spool:windows-firewall' })
  } else if (availabilityDiagnostic) {
    rows.push({
      kind: 'spool-availability',
      key: 'spool:availability',
      diagnostic: availabilityDiagnostic
    })
  }
  rows.push(...args.spoolRows.map((row) => ({ kind: 'spool' as const, key: row.key, row })))
  return rows
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
  if (projected.kind === 'local') {
    return estimateRenderRowSize(
      args.localRows,
      projected.localIndex,
      args.firstLocalHeaderIndex,
      args.activeStickyHeaderIndex
    )
  }
  if (projected.kind === 'spool-windows-firewall') {
    return 154
  }
  if (projected.kind === 'spool-availability') {
    return 144
  }
  if (projected.kind === 'spool-section' || projected.row.type === 'spool-project') {
    return 28
  }
  if (projected.row.type === 'spool-desktop') {
    return 42
  }
  if (projected.row.type === 'spool-desktop-quota') {
    return 76
  }
  if (projected.row.type === 'spool-worktree') {
    return 38
  }
  return 28
}

export function extractWorkspaceSidebarVirtualRowIndexes(args: {
  range: Range
  localRowCount: number
  localRows: readonly RenderRow[]
  stickyHeaderIndexes: readonly number[]
}): number[] {
  // Why: local sticky headers describe local projects only; once the viewport
  // enters Spool, keeping the last local header pinned misstates ownership.
  if (args.range.startIndex >= args.localRowCount) {
    return defaultRangeExtractor(args.range)
  }
  return extractWorktreeVirtualRowIndexes({
    range: args.range,
    stickyHeaderIndexes: args.stickyHeaderIndexes,
    rows: args.localRows
  })
}

export function workspaceSidebarStickyRangeStart(
  rangeStartIndex: number,
  localRowCount: number
): number | null {
  return rangeStartIndex < localRowCount ? rangeStartIndex : null
}
