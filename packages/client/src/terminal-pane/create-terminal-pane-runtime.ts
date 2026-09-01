import { fitAndFocusPanes, fitPanes } from './pane-interactions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

type TerminalPaneRuntimeInput = Pick<
  UseTerminalPaneLifecycleDeps,
  | 'managerRef'
  | 'setPaneCount'
  | 'setPaneLayoutRevision'
  | 'setPaneSnapshot'
  | 'setTabCanExpandPane'
  | 'tabId'
>

export type TerminalPaneRuntime = {
  cancelQueuedResize: () => void
  queueResizeAll: (focusActive: boolean) => void
  syncCanExpandState: () => void
  syncPaneCount: () => void
  syncPaneLayoutRevision: () => void
}

export function createTerminalPaneRuntime({
  managerRef,
  setPaneCount,
  setPaneLayoutRevision,
  setPaneSnapshot,
  setTabCanExpandPane,
  tabId
}: TerminalPaneRuntimeInput): TerminalPaneRuntime {
  let resizeFrame: number | null = null
  const syncPaneSnapshot = (): void => {
    const manager = managerRef.current
    setPaneSnapshot({
      activePane: manager?.getActivePane() ?? null,
      panes: manager?.getPanes() ?? []
    })
  }
  const cancelQueuedResize = (): void => {
    if (resizeFrame !== null) {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = null
    }
  }
  return {
    cancelQueuedResize,
    queueResizeAll: (focusActive) => {
      cancelQueuedResize()
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        const manager = managerRef.current
        if (!manager) {
          return
        }
        if (focusActive) {
          fitAndFocusPanes(manager)
        } else {
          fitPanes(manager)
        }
      })
    },
    syncCanExpandState: () => {
      setTabCanExpandPane(tabId, (managerRef.current?.getPanes().length ?? 1) > 1)
    },
    syncPaneCount: () => {
      setPaneCount(managerRef.current?.getPanes().length ?? 0)
      syncPaneSnapshot()
    },
    syncPaneLayoutRevision: () => {
      setPaneLayoutRevision((revision) => revision + 1)
      syncPaneSnapshot()
    }
  }
}
