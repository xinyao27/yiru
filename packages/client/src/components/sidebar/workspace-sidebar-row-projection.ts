import type { CoworkingSidebarRow } from './coworking-sidebar-rows'
import type { RenderRow } from './worktree-list-virtual-rows'
import { estimateRenderRowSize } from './worktree-list-virtual-rows'

export type WorkspaceSidebarProjectedRow =
  | {
      kind: 'local'
      key: string
      localIndex: number
      row: RenderRow
    }
  | {
      kind: 'coworking-windows-firewall'
      key: 'coworking:windows-firewall'
    }
  | {
      kind: 'coworking-remote-worktrees-header'
      key: 'coworking:remote-worktrees-header'
      worktreeCount: number
      collapsed: boolean
    }
  | {
      kind: 'coworking'
      key: string
      row: CoworkingSidebarRow
      localProjectHeaderKey?: string
    }

type MatchedCoworkingRows = {
  rows: CoworkingSidebarRow[]
  worktreeCount: number
}

export const COWORKING_REMOTE_WORKTREES_HEADER_KEY = 'coworking:remote-worktrees-header'

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

function groupCoworkingRowsByLocalProject(
  coworkingRows: readonly CoworkingSidebarRow[],
  localHeaderIndexByIdentity: ReadonlyMap<string, number>
): {
  matchedByHeaderIndex: Map<number, MatchedCoworkingRows>
  unmatched: CoworkingSidebarRow[]
} {
  const matchedByHeaderIndex = new Map<number, MatchedCoworkingRows>()
  const unmatched: CoworkingSidebarRow[] = []
  let activeTarget: CoworkingSidebarRow[] | null = null
  for (const row of coworkingRows) {
    if (row.type === 'coworking-worktree') {
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
    if (row.type === 'coworking-session' && activeTarget) {
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

export function shouldShowCoworkingWindowsFirewallDiagnostic(
  status: 'starting' | 'ready' | 'unavailable',
  diagnostic: string | null
): boolean {
  return status === 'unavailable' && diagnostic === 'coworking_windows_firewall_unavailable'
}

export function projectWorkspaceSidebarRows(args: {
  localRows: readonly RenderRow[]
  coworkingRows: readonly CoworkingSidebarRow[]
  coworkingStatus: 'starting' | 'ready' | 'unavailable'
  coworkingDiagnostic: string | null
  remoteWorktreesCollapsed?: boolean
  getLocalRowKey: (row: RenderRow) => string
}): WorkspaceSidebarProjectedRow[] {
  const localHeaderIndexByIdentity = getLocalProjectHeaderIndexByIdentity(args.localRows)
  const { matchedByHeaderIndex, unmatched } = groupCoworkingRowsByLocalProject(
    args.coworkingRows,
    localHeaderIndexByIdentity
  )
  const rows: WorkspaceSidebarProjectedRow[] = []
  let activeMatched:
    | { headerKey: string; collapsed: boolean; coworkingRows: readonly CoworkingSidebarRow[] }
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
        coworkingRows: matched.rows
      }
    }
    if (activeMatched && isLocalSectionBoundary(args.localRows[localIndex + 1])) {
      const completedMatch = activeMatched
      if (!completedMatch.collapsed) {
        rows.push(
          ...completedMatch.coworkingRows.map((row) => ({
            kind: 'coworking' as const,
            key: row.key,
            row,
            localProjectHeaderKey: completedMatch.headerKey
          }))
        )
      }
      activeMatched = undefined
    }
  }
  const showWindowsFirewall = shouldShowCoworkingWindowsFirewallDiagnostic(
    args.coworkingStatus,
    args.coworkingDiagnostic
  )
  if (args.coworkingRows.length === 0 && !showWindowsFirewall) {
    return rows
  }
  if (showWindowsFirewall) {
    rows.push({ kind: 'coworking-windows-firewall', key: 'coworking:windows-firewall' })
  }
  const unmatchedWorktreeCount = unmatched.filter((row) => row.type === 'coworking-worktree').length
  if (unmatchedWorktreeCount > 0) {
    // Why: a remote worktree without one unambiguous local Project must not
    // visually inherit whichever local Project happens to precede it.
    rows.push({
      kind: 'coworking-remote-worktrees-header',
      key: COWORKING_REMOTE_WORKTREES_HEADER_KEY,
      worktreeCount: unmatchedWorktreeCount,
      collapsed: args.remoteWorktreesCollapsed === true
    })
  }
  if (unmatchedWorktreeCount === 0 || !args.remoteWorktreesCollapsed) {
    rows.push(...unmatched.map((row) => ({ kind: 'coworking' as const, key: row.key, row })))
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
  if (projected.kind === 'coworking-windows-firewall') {
    return 154
  }
  if (projected.kind === 'coworking-remote-worktrees-header') {
    return 32
  }
  if (projected.row.type === 'coworking-worktree') {
    return projected.row.branch || projected.row.sessionCatalogStatus !== 'complete' ? 44 : 32
  }
  return 24
}
