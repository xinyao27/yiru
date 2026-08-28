import { useAppStore } from '~renderer/store/state'

import type {
  PaneExternalDropHandler,
  PaneExternalDropResolver,
  PaneManager
} from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'
import {
  detachTerminalPaneToTab,
  isTerminalTabStripDropTarget,
  resolveTerminalTabStripDropTarget
} from './tab-detach'

type TerminalExternalDropInput = {
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  persistLayoutSnapshot: () => void
  tabId: string
  worktreeId: string
}

export function createTerminalExternalDrop({
  managerRef,
  paneTransportsRef,
  persistLayoutSnapshot,
  tabId,
  worktreeId
}: TerminalExternalDropInput): {
  onExternalPaneDrop: PaneExternalDropHandler
  resolveExternalPaneDropTarget: PaneExternalDropResolver
} {
  return {
    resolveExternalPaneDropTarget: ({ sourcePaneId, clientX, clientY }) => {
      const panes = managerRef.current?.getPanes() ?? []
      if (panes.length <= 1 || !panes.some((pane) => pane.id === sourcePaneId)) {
        return null
      }
      return resolveTerminalTabStripDropTarget({
        clientX,
        clientY,
        groupsByWorktree: useAppStore.getState().groupsByWorktree,
        worktreeId
      })
    },
    onExternalPaneDrop: (sourcePaneId, target) => {
      if (!isTerminalTabStripDropTarget(target)) {
        return false
      }
      const fallbackPtyId = paneTransportsRef.current.get(sourcePaneId)?.getPtyId() ?? null
      return (
        detachTerminalPaneToTab({
          fallbackPtyId,
          getStore: useAppStore.getState,
          manager: managerRef.current,
          persistLayoutSnapshot,
          sourcePaneId,
          sourceTabId: tabId,
          targetGroupId: target.groupId,
          targetIndex: target.insertionIndex,
          worktreeId
        }) !== null
      )
    }
  }
}
