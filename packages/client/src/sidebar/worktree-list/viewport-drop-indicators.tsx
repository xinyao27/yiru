import type React from 'react'

import { WorktreeSidebarDropIndicator } from '../worktree-sidebar-drop-indicator'

export function ViewportDropIndicators(props: {
  scrollOffset: number
  repo?: { isEnabled: boolean; draggingId: string | null; y: number | null }
  projectGroup?: { isEnabled: boolean; draggingId: string | null; y: number | null }
  host: { draggingId: string | null; y: number | null }
  worktree: { draggingId: string | null; y: number | null }
}): React.JSX.Element {
  return (
    <>
      {props.repo?.isEnabled && props.repo.draggingId !== null && props.repo.y !== null ? (
        <WorktreeSidebarDropIndicator y={props.repo.y - props.scrollOffset} />
      ) : null}
      {props.projectGroup?.isEnabled &&
      props.projectGroup.draggingId !== null &&
      props.projectGroup.y !== null ? (
        <WorktreeSidebarDropIndicator y={props.projectGroup.y - props.scrollOffset} />
      ) : null}
      {props.host.draggingId !== null && props.host.y !== null ? (
        <WorktreeSidebarDropIndicator y={props.host.y - props.scrollOffset} className="z-40" />
      ) : null}
      {props.worktree.draggingId !== null && props.worktree.y !== null ? (
        <WorktreeSidebarDropIndicator y={props.worktree.y - props.scrollOffset} />
      ) : null}
    </>
  )
}
