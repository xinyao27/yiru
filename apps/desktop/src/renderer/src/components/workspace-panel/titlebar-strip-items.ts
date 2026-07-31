import { ClockCounterClockwise, Folder, FolderOpen, Play } from '@phosphor-icons/react'
import type { ActiveRightSidebarTab } from '~renderer/components/editor/state'

import type { ActivityBarItem } from './activity-bar-buttons'

export type WorkspaceTitlebarStripItem =
  | { id: ActiveRightSidebarTab; kind: 'panel'; panel: ActivityBarItem }
  | { id: 'open-in'; kind: 'open-in'; title: string }
  | { id: 'commands'; kind: 'commands'; title: string }

/** `number` = insert-before gap (0..visibleCount); `more` = unpin into overflow. */
export type WorkspacePanelTitlebarDropTarget = 'more' | number | null

export function resolvePanelIcon(item: ActivityBarItem, active: boolean): ActivityBarItem['icon'] {
  if (item.id === 'explorer') {
    return active ? FolderOpen : Folder
  }
  if (item.id === 'vault') {
    return ClockCounterClockwise
  }
  return item.icon
}

export function resolveItemIcon(
  item: WorkspaceTitlebarStripItem,
  active: boolean
): ActivityBarItem['icon'] {
  if (item.kind === 'open-in') {
    return FolderOpen
  }
  if (item.kind === 'commands') {
    return Play
  }
  return resolvePanelIcon(item.panel, active)
}
