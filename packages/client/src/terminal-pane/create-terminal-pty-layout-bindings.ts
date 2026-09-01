import { useAppStore } from '../store/state'
import { EMPTY_LAYOUT } from './layout-serialization'
import type { PaneManager } from './pane-manager/pane-manager'
import { resolveTerminalLayoutActiveLeafId } from './terminal-layout-leaf-ids'

type TerminalPtyLayoutBindingsInput = {
  managerRef: React.RefObject<PaneManager | null>
  tabId: string
}

export function createTerminalPtyLayoutBindings({
  managerRef,
  tabId
}: TerminalPtyLayoutBindingsInput): {
  clearExitedPanePtyLayoutBinding: (paneId: number, exitedPtyId: string) => void
  syncPanePtyLayoutBinding: (paneId: number, ptyId: string | null) => void
} {
  const writeBinding = (
    paneId: number,
    ptyId: string | null,
    repairActiveLeafOnClear: boolean
  ): void => {
    const state = useAppStore.getState()
    const existingLayout = state.terminalLayoutsByTabId[tabId] ?? EMPTY_LAYOUT
    const { ptyIdsByLeafId: _existingBindings, ...layoutWithoutBindings } = existingLayout
    const existingBindings = existingLayout.ptyIdsByLeafId ?? {}
    const leafId = managerRef.current?.getLeafId(paneId)
    if (!leafId) {
      return
    }
    if (ptyId) {
      state.setTabLayout(tabId, {
        ...layoutWithoutBindings,
        ptyIdsByLeafId: { ...existingBindings, [leafId]: ptyId }
      })
      return
    }
    const nextBindings = { ...existingBindings }
    delete nextBindings[leafId]
    const nextLayout = {
      ...layoutWithoutBindings,
      ...(Object.keys(nextBindings).length > 0 ? { ptyIdsByLeafId: nextBindings } : {})
    }
    if (
      repairActiveLeafOnClear &&
      existingLayout.activeLeafId === leafId &&
      Object.keys(nextBindings).length > 0
    ) {
      nextLayout.activeLeafId = resolveTerminalLayoutActiveLeafId({
        root: nextLayout.root,
        activeLeafId: nextLayout.activeLeafId,
        ptyIdsByLeafId: nextBindings
      })
    }
    state.setTabLayout(tabId, nextLayout)
  }

  return {
    clearExitedPanePtyLayoutBinding: (paneId, exitedPtyId) => {
      const state = useAppStore.getState()
      const existingLayout = state.terminalLayoutsByTabId[tabId] ?? EMPTY_LAYOUT
      const { ptyIdsByLeafId: _existingBindings, ...layoutWithoutBindings } = existingLayout
      const existingBindings = existingLayout.ptyIdsByLeafId ?? {}
      const leafId = managerRef.current?.getLeafId(paneId)
      if (!leafId || existingBindings[leafId] !== exitedPtyId) {
        return
      }
      const nextBindings = { ...existingBindings }
      delete nextBindings[leafId]
      state.setTabLayout(tabId, {
        ...layoutWithoutBindings,
        activeLeafId: resolveTerminalLayoutActiveLeafId({
          root: existingLayout.root,
          activeLeafId: existingLayout.activeLeafId,
          ptyIdsByLeafId: nextBindings
        }),
        ...(Object.keys(nextBindings).length > 0 ? { ptyIdsByLeafId: nextBindings } : {})
      })
    },
    syncPanePtyLayoutBinding: (paneId, ptyId) => writeBinding(paneId, ptyId, false)
  }
}
