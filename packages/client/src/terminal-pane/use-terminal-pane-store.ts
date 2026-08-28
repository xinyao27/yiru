import { useRef } from 'react'

import { useAppStore } from '../store/state'
import { collectLeafIdsInOrder, EMPTY_LAYOUT } from './layout-serialization'
import { isWindowsUserAgent } from './pane-interactions'
import { selectTerminalTabAgentTypesByLeaf } from './terminal-tab-agent-type-index'
import { getCachedTerminalTabForWorktree } from './terminal-tab-lookup'
import { sanitizeTerminalLayoutPaneTitles } from './title-sanitization'

type TerminalPaneStoreInput = {
  tabId: string
  worktreeId: string
}

export function useTerminalPaneStore({ tabId, worktreeId }: TerminalPaneStoreInput) {
  const savedLayout = useAppStore((store) => store.terminalLayoutsByTabId[tabId] ?? EMPTY_LAYOUT)
  const terminalTab = useAppStore((store) =>
    getCachedTerminalTabForWorktree(store.tabsByWorktree, worktreeId, tabId)
  )
  const restoredLayout = terminalTab
    ? sanitizeTerminalLayoutPaneTitles(savedLayout, terminalTab)
    : savedLayout
  const expectedLeafIds = collectLeafIdsInOrder(restoredLayout.root)
  const initialLayoutRef = useRef(restoredLayout)
  const settings = useAppStore((store) => store.settings)

  return {
    clearCodexRestartNotice: useAppStore((store) => store.clearCodexRestartNotice),
    clearRuntimePaneTitle: useAppStore((store) => store.clearRuntimePaneTitle),
    clearTabPtyId: useAppStore((store) => store.clearTabPtyId),
    clearTerminalPaneUnread: useAppStore((store) => store.clearTerminalPaneUnread),
    clearTerminalTabUnread: useAppStore((store) => store.clearTerminalTabUnread),
    clearWorktreeUnread: useAppStore((store) => store.clearWorktreeUnread),
    consumePendingCodexPaneRestart: useAppStore((store) => store.consumePendingCodexPaneRestart),
    consumeSuppressedPtyExit: useAppStore((store) => store.consumeSuppressedPtyExit),
    expectedLayoutLeafIdsAttr: expectedLeafIds.length > 0 ? expectedLeafIds.join(' ') : undefined,
    forceBracketedMultilineTextPaste: isWindowsUserAgent(),
    initialLayoutRef,
    keybindings: useAppStore((store) => store.keybindings),
    markTerminalPaneUnread: useAppStore((store) => store.markTerminalPaneUnread),
    markTerminalTabUnread: useAppStore((store) => store.markTerminalTabUnread),
    markWorktreeUnread: useAppStore((store) => store.markWorktreeUnread),
    openSpacePage: useAppStore((store) => store.openSpacePage),
    pendingCodexPaneRestartIds: useAppStore((store) => store.pendingCodexPaneRestartIds),
    refreshWorkspaceSpace: useAppStore((store) => store.refreshWorkspaceSpace),
    restoredLayout,
    rightClickToPaste: settings?.terminalRightClickToPaste ?? isWindowsUserAgent(),
    savedLayout,
    setCacheTimerStartedAt: useAppStore((store) => store.setCacheTimerStartedAt),
    setRuntimePaneTitle: useAppStore((store) => store.setRuntimePaneTitle),
    setTabCanExpandPane: useAppStore((store) => store.setTabCanExpandPane),
    setTabLayout: useAppStore((store) => store.setTabLayout),
    setTabPaneExpanded: useAppStore((store) => store.setTabPaneExpanded),
    settings,
    suppressPtyExit: useAppStore((store) => store.suppressPtyExit),
    tabAgentTypeByLeaf: useAppStore((store) =>
      selectTerminalTabAgentTypesByLeaf(store.agentStatusByPaneKey, tabId)
    ),
    terminalTab,
    updateTabPtyId: useAppStore((store) => store.updateTabPtyId),
    updateTabTitle: useAppStore((store) => store.updateTabTitle)
  }
}
