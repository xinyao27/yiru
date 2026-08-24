import type { DragReorderCallbacks, DragReorderState } from './pane-drag-reorder'
import type { PaneIdentityRegistry } from './pane-identity-registry'
import { createPaneDOM } from './pane-lifecycle'
import type { ManagedPaneInternal, PaneManagerOptions } from './types'

export function createManagedPane(args: {
  id: number
  leafIdHint?: string
  identities: PaneIdentityRegistry
  managerOptions: PaneManagerOptions
  dragState: DragReorderState
  getDragCallbacks: () => DragReorderCallbacks
  renderingSuspended: boolean
  isDestroyed: () => boolean
  setActivePane: (paneId: number, focus: boolean) => void
  handleMouseEnter: (paneId: number, event: MouseEvent) => void
}): ManagedPaneInternal {
  const leafId = args.identities.claimLeafId(args.leafIdHint)
  const pane = createPaneDOM(
    args.id,
    leafId,
    args.managerOptions,
    args.dragState,
    args.getDragCallbacks(),
    // Why: browser textarea focus can lag the manager after a split.
    (paneId, options) => {
      if (!args.isDestroyed()) {
        args.setActivePane(paneId, options?.focusTerminal !== false)
      }
    },
    args.handleMouseEnter
  )
  pane.webglAttachmentDeferred = args.renderingSuspended
  return pane
}
