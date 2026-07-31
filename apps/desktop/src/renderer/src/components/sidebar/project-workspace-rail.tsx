import type React from 'react'

import type { WorkspaceSidebarProjectedRow } from './workspace-sidebar-row-projection'
import { getProjectGroupHeaderPaddingLeft } from './worktree-list-indentation'

type ProjectWorkspaceRail = {
  leftPx: number
  projectKey: string
  segment: 'header' | 'workspace'
}

type ProjectWorkspaceRailStartProps = {
  paddingLeftPx: number
}

type ProjectWorkspaceRailSegmentProps = {
  heightPx: number
  leftPx: number
  topPx: number
}

const PROJECT_ICON_CENTER_OFFSET_PX = 10

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
    for (const sectionIndex of activeProject.sectionIndexes.slice(
      0,
      activeProject.lastWorkspaceOffset + 1
    )) {
      rails.set(sectionIndex, {
        leftPx: activeProject.leftPx,
        projectKey: activeProject.headerKey,
        segment: 'workspace'
      })
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
          lastWorkspaceOffset: null
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
