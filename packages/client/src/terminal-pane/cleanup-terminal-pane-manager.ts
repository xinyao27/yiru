import type { IDisposable } from '@xterm/xterm'

import { useAppStore } from '../store/state'
import { restoreExpandedLayoutFrom } from './expand-collapse'
import type { PaneManager } from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'
import { shouldDetachPaneTransportOnUnmount } from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'
import { captureParkedTerminalPaneCandidates } from './terminal-parked-tab-watchers'

type CleanupTerminalPaneManagerInput = {
  cancelQueuedResize: () => void
  disposableMaps: readonly Map<number, IDisposable>[]
  expandedStyleSnapshots: Map<HTMLElement, { display: string; flex: string }>
  manager: PaneManager
  managerRef: UseTerminalPaneLifecycleDeps['managerRef']
  panePtyBindings: Map<number, IDisposable>
  paneTransports: Map<number, PtyTransport>
  removeCommandEventListeners: () => void
  selectionCaptureTimers: Map<number, number>
  setTabCanExpandPane: UseTerminalPaneLifecycleDeps['setTabCanExpandPane']
  setTabPaneExpanded: UseTerminalPaneLifecycleDeps['setTabPaneExpanded']
  tabId: string
  unregisterRuntimeTab: () => void
  worktreeId: string
}

export function cleanupTerminalPaneManager({
  cancelQueuedResize,
  disposableMaps,
  expandedStyleSnapshots,
  manager,
  managerRef,
  panePtyBindings,
  paneTransports,
  removeCommandEventListeners,
  selectionCaptureTimers,
  setTabCanExpandPane,
  setTabPaneExpanded,
  tabId,
  unregisterRuntimeTab,
  worktreeId
}: CleanupTerminalPaneManagerInput): void {
  removeCommandEventListeners()
  const currentWorktreeTabs = useAppStore.getState().tabsByWorktree[worktreeId]
  const tabStillExists = Boolean(currentWorktreeTabs?.some((candidate) => candidate.id === tabId))
  unregisterRuntimeTab()
  cancelQueuedResize()
  restoreExpandedLayoutFrom(expandedStyleSnapshots)
  for (const disposableMap of disposableMaps) {
    for (const disposable of disposableMap.values()) {
      disposable.dispose()
    }
    disposableMap.clear()
  }
  for (const timer of selectionCaptureTimers.values()) {
    window.clearTimeout(timer)
  }
  selectionCaptureTimers.clear()

  captureParkedTerminalPaneCandidates(
    tabId,
    worktreeId,
    manager.getPanes().map((pane) => ({
      ptyId: paneTransports.get(pane.id)?.getPtyId() ?? null,
      paneId: pane.id,
      leafId: pane.leafId,
      drivesTabTitle: manager.getActivePane()?.id === pane.id
    }))
  )
  for (const transport of paneTransports.values()) {
    const ptyId = transport.getPtyId()
    if (
      shouldDetachPaneTransportOnUnmount({
        tabStillExists,
        tabId,
        ptyId,
        worktreeTabs: currentWorktreeTabs
      })
    ) {
      transport.detach?.()
    } else {
      transport.destroy?.()
    }
  }
  for (const panePtyBinding of panePtyBindings.values()) {
    panePtyBinding.dispose()
  }
  panePtyBindings.clear()
  paneTransports.clear()
  manager.destroy()
  managerRef.current = null
  setTabPaneExpanded(tabId, false)
  setTabCanExpandPane(tabId, false)
}
