import { useEffect } from 'react'

import { setRuntimeUIState } from '../runtime/ui-client'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'

type PersistedUiState = Pick<
  AppState,
  | 'acknowledgedAgentsByPaneKey'
  | 'activeView'
  | 'filterRepoIds'
  | 'groupBy'
  | 'hideDefaultBranchWorkspace'
  | 'markdownTocPanelWidth'
  | 'persistedUIReady'
  | 'projectOrderBy'
  | 'rightSidebarExplorerView'
  | 'rightSidebarOpen'
  | 'rightSidebarTab'
  | 'rightSidebarWidth'
  | 'showDotfilesByWorktree'
  | 'showSleepingWorkspaces'
  | 'sidebarWidth'
  | 'sortBy'
>

export function usePersistedUi(state: PersistedUiState): void {
  useEffect(() => {
    if (!state.persistedUIReady) {
      return
    }
    const timer = window.setTimeout(() => {
      void setRuntimeUIState(useAppStore.getState().settings, {
        sidebarWidth: state.sidebarWidth,
        rightSidebarOpen: state.rightSidebarOpen,
        rightSidebarTab: state.rightSidebarTab,
        rightSidebarExplorerView: state.rightSidebarExplorerView,
        rightSidebarWidth: state.rightSidebarWidth,
        markdownTocPanelWidth: state.markdownTocPanelWidth,
        groupBy: state.groupBy,
        sortBy: state.sortBy,
        projectOrderBy: state.projectOrderBy,
        showActiveOnly: false,
        hideSleepingWorkspaces: !state.showSleepingWorkspaces,
        showSleepingWorkspaces: state.showSleepingWorkspaces,
        hideDefaultBranchWorkspace: state.hideDefaultBranchWorkspace,
        showDotfilesByWorktree: state.showDotfilesByWorktree,
        filterRepoIds: state.filterRepoIds,
        activeView: state.activeView,
        acknowledgedAgentsByPaneKey: state.acknowledgedAgentsByPaneKey
      })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [
    state.acknowledgedAgentsByPaneKey,
    state.activeView,
    state.filterRepoIds,
    state.groupBy,
    state.hideDefaultBranchWorkspace,
    state.markdownTocPanelWidth,
    state.persistedUIReady,
    state.projectOrderBy,
    state.rightSidebarExplorerView,
    state.rightSidebarOpen,
    state.rightSidebarTab,
    state.rightSidebarWidth,
    state.showDotfilesByWorktree,
    state.showSleepingWorkspaces,
    state.sidebarWidth,
    state.sortBy
  ])
}
