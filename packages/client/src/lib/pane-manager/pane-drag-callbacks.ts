import { applyDividerStyles, applyPaneOpacity } from './pane-divider'
import type { DragReorderCallbacks } from './pane-drag-reorder'
import { safeFit, refitPanesUnder } from './pane-tree-ops'
import type { ManagedPaneInternal, PaneManagerOptions, PaneStyleOptions } from './types'

export function createPaneDragCallbacks(args: {
  panes: Map<number, ManagedPaneInternal>
  root: HTMLElement
  getStyleOptions: () => PaneStyleOptions
  getActivePaneId: () => number | null
  isDestroyed: () => boolean
  requestPaneReparentFrame: (callback: FrameRequestCallback) => void
  managerOptions: PaneManagerOptions
}): DragReorderCallbacks {
  return {
    getPanes: () => args.panes,
    getRoot: () => args.root,
    getStyleOptions: args.getStyleOptions,
    isDestroyed: args.isDestroyed,
    safeFit,
    applyPaneOpacity: () =>
      applyPaneOpacity(args.panes.values(), args.getActivePaneId(), args.getStyleOptions()),
    applyDividerStyles: () => applyDividerStyles(args.root, args.getStyleOptions()),
    refitPanesUnder: (element) => refitPanesUnder(element, args.panes),
    requestPaneReparentFrame: args.requestPaneReparentFrame,
    onLayoutChanged: args.managerOptions.onLayoutChanged,
    onDragActiveChange: args.managerOptions.onPaneDragActiveChange,
    resolveExternalDropTarget: args.managerOptions.resolveExternalPaneDropTarget,
    onExternalPaneDrop: args.managerOptions.onExternalPaneDrop
  }
}
