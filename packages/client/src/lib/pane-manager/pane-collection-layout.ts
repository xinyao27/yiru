import { applyPaneOpacity } from './pane-divider'
import { openTerminal } from './pane-lifecycle'
import { toPublicPane } from './pane-public-view'
import { equalizePaneSplitSizes } from './pane-tree-ops'
import type { ManagedPane, ManagedPaneInternal, PaneStyleOptions } from './types'

export function mountInitialManagedPane(args: {
  pane: ManagedPaneInternal
  root: HTMLElement
  panes: Map<number, ManagedPaneInternal>
  styleOptions: PaneStyleOptions
  focus: boolean
  publish: (pane: ManagedPaneInternal) => void
}): ManagedPane {
  Object.assign(args.pane.container.style, {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden'
  })
  args.root.appendChild(args.pane.container)
  openTerminal(args.pane)
  applyPaneOpacity(args.panes.values(), args.pane.id, args.styleOptions)
  if (args.focus) {
    args.pane.terminal.focus()
  }
  args.publish(args.pane)
  return toPublicPane(args.pane)
}

export function equalizeManagedPaneSizes(root: HTMLElement): boolean {
  return equalizePaneSplitSizes(
    root.firstElementChild instanceof HTMLElement ? root.firstElementChild : null
  )
}
