import { defaultRangeExtractor, type Range } from '@tanstack/react-virtual'

import type { SpoolSidebarRow } from './spool-sidebar-rows'
import type { RenderRow } from './worktree-list-virtual-rows'
import {
  estimateRenderRowSize,
  extractWorktreeVirtualRowIndexes
} from './worktree-list-virtual-rows'

export type WorkspaceSidebarProjectedRow =
  | {
      kind: 'local'
      key: string
      localIndex: number
      row: RenderRow
    }
  | {
      kind: 'spool-windows-firewall'
      key: 'spool:windows-firewall'
    }
  | {
      kind: 'spool-remote-worktrees-header'
      key: 'spool:remote-worktrees-header'
      worktreeCount: number
      collapsed: boolean
    }
  | {
      kind: 'spool'
      key: string
      row: SpoolSidebarRow
      localProjectHeaderKey?: string
    }

type MatchedSpoolRows = {
  rows: SpoolSidebarRow[]
  worktreeCount: number
}

export const SPOOL_REMOTE_WORKTREES_HEADER_KEY = 'spool:remote-worktrees-header'

function getLocalProjectHeaderIndexByIdentity(
  localRows: readonly RenderRow[]
): Map<string, number> {
  const candidateIndexesByIdentity = new Map<string, number[]>()
  for (const [index, row] of localRows.entries()) {
    if (row.type !== 'header' || !row.projectIdentityKey) {
      continue
    }
    const candidateIndexes = candidateIndexesByIdentity.get(row.projectIdentityKey) ?? []
    candidateIndexes.push(index)
    candidateIndexesByIdentity.set(row.projectIdentityKey, candidateIndexes)
  }

  const indexByIdentity = new Map<string, number>()
  for (const [identity, candidateIndexes] of candidateIndexesByIdentity) {
    const unsuffixedIndexes = candidateIndexes.filter((index) => {
      const row = localRows[index]
      return row?.type === 'header' && !row.key.includes('::setup:')
    })
    const unambiguousIndex =
      candidateIndexes.length === 1
        ? candidateIndexes[0]
        : unsuffixedIndexes.length === 1
          ? unsuffixedIndexes[0]
          : undefined
    // Why: duplicate host/setup sections represent distinct local contexts;
    // leave remote rows ungrouped rather than attaching them arbitrarily.
    if (unambiguousIndex !== undefined) {
      indexByIdentity.set(identity, unambiguousIndex)
    }
  }
  return indexByIdentity
}

function groupSpoolRowsByLocalProject(
  spoolRows: readonly SpoolSidebarRow[],
  localHeaderIndexByIdentity: ReadonlyMap<string, number>
): {
  matchedByHeaderIndex: Map<number, MatchedSpoolRows>
  unmatched: SpoolSidebarRow[]
} {
  const matchedByHeaderIndex = new Map<number, MatchedSpoolRows>()
  const unmatched: SpoolSidebarRow[] = []
  let activeTarget: SpoolSidebarRow[] | null = null
  for (const row of spoolRows) {
    if (row.type === 'spool-worktree') {
      const localHeaderIndex = row.projectIdentityKey
        ? localHeaderIndexByIdentity.get(row.projectIdentityKey)
        : undefined
      if (localHeaderIndex === undefined) {
        unmatched.push(row)
        activeTarget = unmatched
        continue
      }
      const matched = matchedByHeaderIndex.get(localHeaderIndex) ?? { rows: [], worktreeCount: 0 }
      matched.rows.push(row)
      matched.worktreeCount += 1
      matchedByHeaderIndex.set(localHeaderIndex, matched)
      activeTarget = matched.rows
      continue
    }
    if (row.type === 'spool-session' && activeTarget) {
      activeTarget.push(row)
      continue
    }
    unmatched.push(row)
    activeTarget = null
  }
  return { matchedByHeaderIndex, unmatched }
}

function isLocalSectionBoundary(row: RenderRow | undefined): boolean {
  return !row || row.type === 'header' || row.type === 'host-header'
}

export function shouldShowSpoolWindowsFirewallDiagnostic(
  status: 'starting' | 'ready' | 'unavailable',
  diagnostic: string | null
): boolean {
  return status === 'unavailable' && diagnostic === 'spool_windows_firewall_unavailable'
}

export function projectWorkspaceSidebarRows(args: {
  localRows: readonly RenderRow[]
  spoolRows: readonly SpoolSidebarRow[]
  spoolStatus: 'starting' | 'ready' | 'unavailable'
  spoolDiagnostic: string | null
  remoteWorktreesCollapsed?: boolean
  getLocalRowKey: (row: RenderRow) => string
}): WorkspaceSidebarProjectedRow[] {
  const localHeaderIndexByIdentity = getLocalProjectHeaderIndexByIdentity(args.localRows)
  const { matchedByHeaderIndex, unmatched } = groupSpoolRowsByLocalProject(
    args.spoolRows,
    localHeaderIndexByIdentity
  )
  const rows: WorkspaceSidebarProjectedRow[] = []
  let activeMatched:
    | { headerKey: string; collapsed: boolean; spoolRows: readonly SpoolSidebarRow[] }
    | undefined
  for (const [localIndex, localRow] of args.localRows.entries()) {
    const matched = localRow.type === 'header' ? matchedByHeaderIndex.get(localIndex) : undefined
    const projectedRow =
      matched && localRow.type === 'header'
        ? { ...localRow, count: localRow.count + matched.worktreeCount }
        : localRow
    rows.push({
      kind: 'local',
      key: args.getLocalRowKey(localRow),
      localIndex,
      row: projectedRow
    })
    if (matched && localRow.type === 'header') {
      activeMatched = {
        headerKey: localRow.key,
        collapsed: localRow.collapsed === true,
        spoolRows: matched.rows
      }
    }
    if (activeMatched && isLocalSectionBoundary(args.localRows[localIndex + 1])) {
      const completedMatch = activeMatched
      if (!completedMatch.collapsed) {
        rows.push(
          ...completedMatch.spoolRows.map((row) => ({
            kind: 'spool' as const,
            key: row.key,
            row,
            localProjectHeaderKey: completedMatch.headerKey
          }))
        )
      }
      activeMatched = undefined
    }
  }
  const showWindowsFirewall = shouldShowSpoolWindowsFirewallDiagnostic(
    args.spoolStatus,
    args.spoolDiagnostic
  )
  if (args.spoolRows.length === 0 && !showWindowsFirewall) {
    return rows
  }
  if (showWindowsFirewall) {
    rows.push({ kind: 'spool-windows-firewall', key: 'spool:windows-firewall' })
  }
  const unmatchedWorktreeCount = unmatched.filter((row) => row.type === 'spool-worktree').length
  if (unmatchedWorktreeCount > 0) {
    // Why: a remote worktree without one unambiguous local Project must not
    // visually inherit whichever local Project happens to precede it.
    rows.push({
      kind: 'spool-remote-worktrees-header',
      key: SPOOL_REMOTE_WORKTREES_HEADER_KEY,
      worktreeCount: unmatchedWorktreeCount,
      collapsed: args.remoteWorktreesCollapsed === true
    })
  }
  if (unmatchedWorktreeCount === 0 || !args.remoteWorktreesCollapsed) {
    rows.push(...unmatched.map((row) => ({ kind: 'spool' as const, key: row.key, row })))
  }
  return rows
}

export function workspaceIndexForLocalRowIndex(
  rows: readonly WorkspaceSidebarProjectedRow[],
  localIndex: number
): number {
  return rows.findIndex((row) => row.kind === 'local' && row.localIndex === localIndex)
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
  if (projected.kind === 'spool-remote-worktrees-header') {
    return 32
  }
  if (projected.row.type === 'spool-desktop-status') {
    return 32
  }
  if (projected.row.type === 'spool-worktree') {
    return projected.row.branch || projected.row.sessionCatalogStatus !== 'complete' ? 44 : 32
  }
  return 24
}

export function extractWorkspaceSidebarVirtualRowIndexes(args: {
  range: Range
  rows: readonly WorkspaceSidebarProjectedRow[]
  stickyRows: readonly { type: string; projectGroupDepth?: number }[]
  stickyHeaderIndexes: readonly number[]
}): number[] {
  const rangeStart = args.rows[args.range.startIndex]
  // Why: matched remote rows inherit their local Project's sticky context;
  // diagnostics and unmatched remote projects must not inherit the last header.
  if (
    rangeStart?.kind !== 'local' &&
    !(rangeStart?.kind === 'spool' && rangeStart.localProjectHeaderKey)
  ) {
    return defaultRangeExtractor(args.range)
  }
  return extractWorktreeVirtualRowIndexes({
    range: args.range,
    stickyHeaderIndexes: args.stickyHeaderIndexes,
    rows: args.stickyRows
  })
}

export function workspaceSidebarStickyRangeStart(
  rangeStartIndex: number,
  rows: readonly WorkspaceSidebarProjectedRow[]
): number | null {
  const row = rows[rangeStartIndex]
  return row?.kind === 'local' || (row?.kind === 'spool' && row.localProjectHeaderKey)
    ? rangeStartIndex
    : null
}
