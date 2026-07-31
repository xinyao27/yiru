import type React from 'react'

import type { WorkspaceSidebarProjectedRow } from './workspace-sidebar-row-projection'
import {
  getProjectGroupHeaderPaddingLeft,
  getProjectWorktreeCardContentIndent,
  getWorktreeCardStatusGlyphLeft,
  WORKTREE_CARD_STATUS_ICON_CENTER_TOP
} from './worktree-list-indentation'

type ProjectWorkspaceRail = {
  leftPx: number
  projectKey: string
  segment: 'header' | 'workspace'
  // Why: the last workspace row turns the rail into its status glyph instead of
  // running the line past it, so the tree reads as terminated rather than cut.
  elbowWidthPx?: number
}

type ProjectWorkspaceRailStartProps = {
  paddingLeftPx: number
}

type ProjectWorkspaceRailSegmentProps = {
  heightPx: number
  leftPx: number
  topPx: number
}

type ProjectWorkspaceRailEndProps = {
  leftPx: number
  elbowWidthPx: number
}

const PROJECT_ICON_CENTER_OFFSET_PX = 10
// Why: the elbow points at the last row's glyph rather than touching it, matching
// the gap the inline agent rail keeps at its own corner.
const RAIL_ELBOW_GLYPH_GAP_PX = 6
// Why: each row draws its own rail segment, so every segment overshoots the row
// top by the list gap to keep the line unbroken between cards.
const RAIL_ROW_OVERLAP_PX = 2

function isSectionBoundary(row: WorkspaceSidebarProjectedRow): boolean {
  if (row.kind !== 'local') {
    return row.kind !== 'coworking' || row.localProjectHeaderKey === undefined
  }
  return row.row.type === 'header' || row.row.type === 'host-header'
}

function isWorkspaceRow(row: WorkspaceSidebarProjectedRow): boolean {
  if (row.kind === 'coworking') {
    return row.row.type === 'coworking-worktree'
  }
  if (row.kind !== 'local') {
    return false
  }
  return (
    row.row.type === 'item' ||
    row.row.type === 'folder-workspace' ||
    row.row.type === 'lineage-group'
  )
}

// Why: only a plain workspace card ends where its own glyph sits. Lineage
// groups keep descendants inside the same row, so terminating the rail at the
// parent glyph would strand every child below the line.
function getRailElbowWidthPx(
  projected: WorkspaceSidebarProjectedRow,
  railLeftPx: number
): number | null {
  if (projected.kind !== 'local' || projected.row.type !== 'item') {
    return null
  }
  // Why: rails exist only under repo grouping, where workspace cards take the
  // project-grouped indent — one tree step past the generic grouped anchor.
  const elbowWidthPx =
    getWorktreeCardStatusGlyphLeft(
      getProjectWorktreeCardContentIndent({
        groupDepth: projected.row.groupDepth,
        lineageDepth: projected.row.depth
      })
    ) -
    railLeftPx -
    RAIL_ELBOW_GLYPH_GAP_PX

  return elbowWidthPx > 0 ? elbowWidthPx : null
}

export function getProjectWorkspaceRails(
  rows: readonly WorkspaceSidebarProjectedRow[]
): ReadonlyMap<number, ProjectWorkspaceRail> {
  const rails = new Map<number, ProjectWorkspaceRail>()
  let activeProject:
    | {
        headerIndex: number
        headerKey: string
        leftPx: number
        sectionIndexes: number[]
        lastWorkspaceOffset: number | null
        lastWorkspaceElbowWidthPx: number | null
      }
    | undefined

  const finishProject = (): void => {
    if (!activeProject || activeProject.lastWorkspaceOffset === null) {
      activeProject = undefined
      return
    }
    rails.set(activeProject.headerIndex, {
      leftPx: activeProject.leftPx,
      projectKey: activeProject.headerKey,
      segment: 'header'
    })
    const lastWorkspaceIndex = activeProject.sectionIndexes[activeProject.lastWorkspaceOffset]
    const elbowWidthPx = activeProject.lastWorkspaceElbowWidthPx
    for (const sectionIndex of activeProject.sectionIndexes.slice(
      0,
      activeProject.lastWorkspaceOffset + 1
    )) {
      rails.set(
        sectionIndex,
        sectionIndex === lastWorkspaceIndex && elbowWidthPx !== null
          ? {
              leftPx: activeProject.leftPx,
              projectKey: activeProject.headerKey,
              segment: 'workspace',
              elbowWidthPx
            }
          : {
              leftPx: activeProject.leftPx,
              projectKey: activeProject.headerKey,
              segment: 'workspace'
            }
      )
    }
    activeProject = undefined
  }

  rows.forEach((projected, index) => {
    if (isSectionBoundary(projected)) {
      finishProject()
      if (projected.kind === 'local' && projected.row.type === 'header' && projected.row.repo) {
        activeProject = {
          headerIndex: index,
          headerKey: projected.row.key,
          leftPx:
            getProjectGroupHeaderPaddingLeft(projected.row.projectGroupDepth ?? 0) +
            PROJECT_ICON_CENTER_OFFSET_PX,
          sectionIndexes: [],
          lastWorkspaceOffset: null,
          lastWorkspaceElbowWidthPx: null
        }
      }
      return
    }

    if (!activeProject) {
      return
    }
    if (
      projected.kind === 'coworking' &&
      projected.localProjectHeaderKey !== activeProject.headerKey
    ) {
      finishProject()
      return
    }
    activeProject.sectionIndexes.push(index)
    if (isWorkspaceRow(projected)) {
      activeProject.lastWorkspaceOffset = activeProject.sectionIndexes.length - 1
      activeProject.lastWorkspaceElbowWidthPx = getRailElbowWidthPx(projected, activeProject.leftPx)
    }
  })
  finishProject()

  return rails
}

export function ProjectWorkspaceRailStart(
  props: ProjectWorkspaceRailStartProps
): React.JSX.Element {
  const { paddingLeftPx } = props

  return (
    <span
      aria-hidden="true"
      className="bg-sidebar-border pointer-events-none absolute bottom-0 z-10 w-px"
      style={{
        left: paddingLeftPx + PROJECT_ICON_CENTER_OFFSET_PX,
        top: `calc(50% + ${PROJECT_ICON_CENTER_OFFSET_PX}px)`
      }}
    />
  )
}

export function ProjectWorkspaceRailEnd(props: ProjectWorkspaceRailEndProps): React.JSX.Element {
  const { leftPx, elbowWidthPx } = props

  return (
    <>
      <span
        aria-hidden="true"
        className="bg-sidebar-border pointer-events-none absolute z-10 w-px"
        style={{
          left: leftPx,
          top: -RAIL_ROW_OVERLAP_PX,
          height: WORKTREE_CARD_STATUS_ICON_CENTER_TOP + RAIL_ROW_OVERLAP_PX
        }}
      />
      <span
        aria-hidden="true"
        className="bg-sidebar-border pointer-events-none absolute z-10 h-px"
        style={{
          left: leftPx,
          top: WORKTREE_CARD_STATUS_ICON_CENTER_TOP,
          width: elbowWidthPx
        }}
      />
    </>
  )
}

export function ProjectWorkspaceRailSegment(
  props: ProjectWorkspaceRailSegmentProps
): React.JSX.Element {
  const { heightPx, leftPx, topPx } = props

  return (
    <span
      aria-hidden="true"
      className="bg-sidebar-border pointer-events-none absolute top-0 z-10 w-px"
      style={{ left: leftPx, height: heightPx, transform: `translateY(${topPx}px)` }}
    />
  )
}
