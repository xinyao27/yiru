import type { IDisposable } from '@xterm/xterm'

import { scheduleRuntimeGraphSync } from '../runtime/sync-runtime-graph'
import { useAppStore } from '../store/state'
import type { PaneManager } from './pane-manager/pane-manager'
import type { PaneManagerOptions } from './pane-manager/types'
import { resolveTerminalLayoutActiveLeafId } from './terminal-layout-leaf-ids'

type ActivePaneHandlerInput = {
  managerRef: React.RefObject<PaneManager | null>
  panePtyBindings: Map<number, IDisposable>
  persistLayoutSnapshot: () => void
  shouldPersistLayout: () => boolean
  syncPaneLayoutRevision: () => void
  tabId: string
  updateTabTitle: (tabId: string, title: string) => void
}

export function createTerminalActivePaneHandler({
  managerRef,
  panePtyBindings,
  persistLayoutSnapshot,
  shouldPersistLayout,
  syncPaneLayoutRevision,
  tabId,
  updateTabTitle
}: ActivePaneHandlerInput): NonNullable<PaneManagerOptions['onActivePaneChange']> {
  return (pane) => {
    const layout = useAppStore.getState().terminalLayoutsByTabId[tabId]
    const ptyIdsByLeafId = layout?.ptyIdsByLeafId ?? {}
    if (Object.keys(ptyIdsByLeafId).length > 0 && !ptyIdsByLeafId[pane.leafId]) {
      const fallbackLeafId = resolveTerminalLayoutActiveLeafId({
        root: layout?.root,
        activeLeafId: pane.leafId,
        ptyIdsByLeafId
      })
      const fallbackPaneId = fallbackLeafId
        ? (managerRef.current?.getNumericIdForLeaf(fallbackLeafId) ?? null)
        : null
      if (fallbackPaneId != null && fallbackPaneId !== pane.id) {
        managerRef.current?.setActivePane(fallbackPaneId, { focus: true })
        return
      }
    }
    scheduleRuntimeGraphSync()
    syncPaneLayoutRevision()
    if (shouldPersistLayout()) {
      persistLayoutSnapshot()
    }
    const focusedBinding = panePtyBindings.get(pane.id) as
      | (IDisposable & { sampleForegroundAgentOnFocus?: () => void })
      | undefined
    focusedBinding?.sampleForegroundAgentOnFocus?.()
    const paneTitle = useAppStore.getState().runtimePaneTitlesByTabId[tabId]?.[pane.id]
    if (paneTitle) {
      updateTabTitle(tabId, paneTitle)
    }
  }
}

type LayoutHandlerInput = {
  persistLayoutSnapshot: () => void
  queueResizeAll: (focusActive: boolean) => void
  shouldPersistLayout: () => boolean
  syncCanExpandState: () => void
  syncExpandedLayout: () => void
  syncPaneCount: () => void
  syncPaneLayoutRevision: () => void
}

export function createTerminalLayoutHandler({
  persistLayoutSnapshot,
  queueResizeAll,
  shouldPersistLayout,
  syncCanExpandState,
  syncExpandedLayout,
  syncPaneCount,
  syncPaneLayoutRevision
}: LayoutHandlerInput): NonNullable<PaneManagerOptions['onLayoutChanged']> {
  return () => {
    scheduleRuntimeGraphSync()
    syncExpandedLayout()
    syncCanExpandState()
    syncPaneCount()
    syncPaneLayoutRevision()
    queueResizeAll(false)
    if (shouldPersistLayout()) {
      persistLayoutSnapshot()
    }
  }
}
