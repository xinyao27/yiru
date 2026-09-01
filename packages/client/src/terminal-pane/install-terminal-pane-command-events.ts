import {
  CLOSE_TERMINAL_PANE_EVENT,
  SPLIT_TERMINAL_PANE_EVENT,
  type CloseTerminalPaneDetail,
  type SplitTerminalPaneDetail
} from '../constants/terminal'
import { consumePendingRemoteRuntimeSplitMirrorTelemetry } from '../runtime/remote-runtime-session'
import { scheduleRuntimeGraphSync } from '../runtime/sync-runtime-graph'
import { closeTerminalTab } from '../terminal/tab-actions'
import type { PtyConnectionDeps } from './pty/connection-types'
import {
  recordRuntimeCreatedTerminalPaneSplit,
  splitPaneWithOneShotStartup
} from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

type InstallTerminalPaneCommandEventsInput = {
  isActive: boolean
  managerRef: UseTerminalPaneLifecycleDeps['managerRef']
  persistLayoutSnapshot: () => void
  ptyDeps: PtyConnectionDeps
  queueResizeAll: (focusActive: boolean) => void
  syncCanExpandState: () => void
  tabId: string
}

export function installTerminalPaneCommandEvents({
  isActive,
  managerRef,
  persistLayoutSnapshot,
  ptyDeps,
  queueResizeAll,
  syncCanExpandState,
  tabId
}: InstallTerminalPaneCommandEventsInput): () => void {
  const onSplitPane = (event: Event): void => {
    const detail = (event as CustomEvent<SplitTerminalPaneDetail>).detail
    if (!detail?.tabId || detail.tabId !== tabId) {
      return
    }
    const manager = managerRef.current
    if (!manager || (detail.newLeafId && manager.getNumericIdForLeaf(detail.newLeafId) !== null)) {
      return
    }
    const sourcePaneId = detail.sourceLeafId
      ? (manager.getNumericIdForLeaf(detail.sourceLeafId) ?? detail.paneRuntimeId)
      : detail.paneRuntimeId
    if (sourcePaneId < 0) {
      return
    }
    const splitOptions = {
      ...(detail.newLeafId ? { leafId: detail.newLeafId } : {}),
      ...(detail.ptyId ? { ptyId: detail.ptyId } : {})
    }
    if (detail.command) {
      const createdPane = splitPaneWithOneShotStartup(ptyDeps, { command: detail.command }, () =>
        manager.splitPane(sourcePaneId, detail.direction, splitOptions)
      )
      recordRuntimeCreatedTerminalPaneSplit(createdPane, {
        source: detail.telemetrySource ?? 'command',
        direction: detail.direction
      })
      return
    }
    const createdPane = manager.splitPane(sourcePaneId, detail.direction, splitOptions)
    const telemetrySuppressed = createdPane
      ? consumePendingRemoteRuntimeSplitMirrorTelemetry(detail.sourcePtyId, detail.direction)
      : false
    recordRuntimeCreatedTerminalPaneSplit(createdPane, {
      source: detail.telemetrySource ?? 'command',
      direction: detail.direction,
      telemetrySuppressed
    })
  }

  const onClosePane = (event: Event): void => {
    const detail = (event as CustomEvent<CloseTerminalPaneDetail>).detail
    if (!detail?.tabId || detail.tabId !== tabId) {
      return
    }
    const manager = managerRef.current
    if (!manager) {
      return
    }
    if (manager.getPanes().length <= 1) {
      closeTerminalTab(tabId)
      return
    }
    manager.closePane(detail.paneRuntimeId)
    scheduleRuntimeGraphSync()
    syncCanExpandState()
    queueResizeAll(isActive)
    persistLayoutSnapshot()
  }

  window.addEventListener(SPLIT_TERMINAL_PANE_EVENT, onSplitPane)
  window.addEventListener(CLOSE_TERMINAL_PANE_EVENT, onClosePane)
  return () => {
    window.removeEventListener(SPLIT_TERMINAL_PANE_EVENT, onSplitPane)
    window.removeEventListener(CLOSE_TERMINAL_PANE_EVENT, onClosePane)
  }
}
