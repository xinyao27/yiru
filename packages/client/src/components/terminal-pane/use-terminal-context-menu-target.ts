import type { BaseUIEvent } from '@base-ui/react/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ManagedPane, PaneManager } from '~renderer/lib/pane-manager/pane-manager'
import { shellClient } from '~renderer/runtime/shell-client'

const CLOSE_ALL_CONTEXT_MENUS_EVENT = 'yiru-close-all-context-menus'

type TerminalContextMenuTarget = {
  clearMenuPaneTarget: () => void
  menuOpenedAtRef: React.RefObject<number>
  menuPaneId: number | null
  onContextMenu: (event: BaseUIEvent<React.MouseEvent<HTMLDivElement>>) => void
  onPaneTitleContextMenu: (
    event: BaseUIEvent<React.MouseEvent<HTMLElement>>,
    paneId: number
  ) => void
  open: boolean
  paneCount: number
  resolveMenuPane: () => ManagedPane | null
  runForPane: <Result>(paneId: number, action: () => Result) => Result
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useTerminalContextMenuTarget({
  managerRef,
  onRightClickPaste,
  rightClickToPaste
}: {
  managerRef: React.RefObject<PaneManager | null>
  onRightClickPaste: (pane: ManagedPane) => void
  rightClickToPaste: boolean
}): TerminalContextMenuTarget {
  const contextPaneIdRef = useRef<number | null>(null)
  const menuOpenedAtRef = useRef(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const closeMenu = (): void => {
      if (Date.now() - menuOpenedAtRef.current >= 100) {
        setOpen(false)
      }
    }
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  const resolveMenuPane = useCallback((): ManagedPane | null => {
    const manager = managerRef.current
    if (!manager) {
      return null
    }
    const panes = manager.getPanes()
    if (contextPaneIdRef.current !== null) {
      return panes.find((pane) => pane.id === contextPaneIdRef.current) ?? null
    }
    return manager.getActivePane() ?? panes[0] ?? null
  }, [managerRef])

  const openContextMenu = useCallback(
    (event: BaseUIEvent<React.MouseEvent<HTMLElement>>, clickedPaneId: number | null): void => {
      window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
      const manager = managerRef.current
      if (!manager) {
        event.preventBaseUIHandler()
        contextPaneIdRef.current = null
        return
      }
      const clickedPane =
        clickedPaneId !== null
          ? (manager.getPanes().find((pane) => pane.id === clickedPaneId) ?? null)
          : null
      contextPaneIdRef.current = clickedPane?.id ?? null
      // Why: terminal-style right-click copies a selection and otherwise
      // pastes; Ctrl+right-click keeps the application menu reachable.
      if (rightClickToPaste && !event.ctrlKey) {
        event.preventBaseUIHandler()
        event.stopPropagation()
        if (!clickedPane) {
          return
        }
        const selection = clickedPane.terminal.getSelection()
        if (selection) {
          void shellClient.ui.writeClipboardText(selection)
          clickedPane.terminal.clearSelection()
        } else {
          onRightClickPaste(clickedPane)
        }
        return
      }
      menuOpenedAtRef.current = Date.now()
    },
    [managerRef, onRightClickPaste, rightClickToPaste]
  )

  const onContextMenu = useCallback(
    (event: BaseUIEvent<React.MouseEvent<HTMLDivElement>>): void => {
      const manager = managerRef.current
      const target = event.target
      if (!manager || !(target instanceof Node)) {
        event.preventBaseUIHandler()
        contextPaneIdRef.current = null
        return
      }
      const clickedPane = manager.getPanes().find((pane) => pane.container.contains(target)) ?? null
      openContextMenu(event, clickedPane?.id ?? null)
    },
    [managerRef, openContextMenu]
  )
  const onPaneTitleContextMenu = useCallback(
    (event: BaseUIEvent<React.MouseEvent<HTMLElement>>, paneId: number): void => {
      openContextMenu(event, paneId)
    },
    [openContextMenu]
  )
  const runForPane = <Result>(paneId: number, action: () => Result): Result => {
    const previousPaneId = contextPaneIdRef.current
    contextPaneIdRef.current = paneId
    try {
      return action()
    } finally {
      contextPaneIdRef.current = previousPaneId
    }
  }
  const clearMenuPaneTarget = useCallback((): void => {
    contextPaneIdRef.current = null
  }, [])

  // Why: closed menus do not need PaneManager's allocated public wrappers.
  const paneCount = open ? (managerRef.current?.getPanes().length ?? 1) : 1
  const menuPaneId = open ? (resolveMenuPane()?.id ?? null) : null
  return {
    clearMenuPaneTarget,
    menuOpenedAtRef,
    menuPaneId,
    onContextMenu,
    onPaneTitleContextMenu,
    open,
    paneCount,
    resolveMenuPane,
    runForPane,
    setOpen
  }
}
