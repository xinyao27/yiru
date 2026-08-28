import { applyPaneOpacity } from './pane-divider'
import { toPublicPane } from './pane-public-view'
import type { ManagedPaneInternal, PaneManagerOptions, PaneStyleOptions } from './types'

export function activateManagedPane(args: {
  paneId: number
  focus: boolean
  activePaneId: number | null
  panes: Map<number, ManagedPaneInternal>
  styleOptions: PaneStyleOptions
  managerOptions: PaneManagerOptions
}): number | null {
  const pane = args.panes.get(args.paneId)
  if (!pane) {
    return args.activePaneId
  }
  const changed = args.activePaneId !== args.paneId
  applyPaneOpacity(args.panes.values(), args.paneId, args.styleOptions)
  if (args.focus) {
    pane.terminal.focus()
  }
  if (changed) {
    args.managerOptions.onActivePaneChange?.(toPublicPane(pane))
  }
  return args.paneId
}
