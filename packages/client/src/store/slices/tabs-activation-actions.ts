import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import {
  findTabAndWorktree,
  findTabByEntityInGroup,
  pushRecentTabId,
  sanitizeRecentTabIds
} from './tab-group-state'
import type { TabsSlice } from './tabs'

export function createActivationActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<TabsSlice, 'getTab' | 'getActiveTab' | 'findTabForEntityInGroup' | 'activateTab'> {
  return {
    getTab: (tabId) => findTabAndWorktree(get().unifiedTabsByWorktree, tabId)?.tab ?? null,
    getActiveTab: (worktreeId) => {
      const state = get()
      const groupId = state.activeGroupIdByWorktree[worktreeId]
      const group = (state.groupsByWorktree[worktreeId] ?? []).find(
        (candidate) => candidate.id === groupId
      )
      if (!group?.activeTabId) {
        return null
      }
      return (
        (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
          (tab) => tab.id === group.activeTabId
        ) ?? null
      )
    },
    findTabForEntityInGroup: (worktreeId, groupId, entityId, contentType) =>
      findTabByEntityInGroup(
        get().unifiedTabsByWorktree,
        worktreeId,
        groupId,
        entityId,
        contentType
      ),
    activateTab: (tabId, opts) => {
      set((state) => {
        const found = findTabAndWorktree(state.unifiedTabsByWorktree, tabId)
        if (!found) {
          return {}
        }
        const { tab, worktreeId } = found
        // Why: activating a terminal tab dismisses the tab-level bell — the user
        // has now moved their eyes to this tab.
        //
        // Why (activeWorktree guard below): only dismiss the tab-level bell when
        // the tab is in the active worktree — otherwise the tab is not visible
        // yet and the signal would be lost before the user saw it. Mirrors the
        // guard in focusGroup.
        const terminalEntityId = tab.contentType === 'terminal' ? tab.entityId : null
        const nextUnreadTerminalTabs =
          state.activeWorktreeId === worktreeId &&
          terminalEntityId &&
          state.unreadTerminalTabs[terminalEntityId]
            ? (() => {
                const copy = { ...state.unreadTerminalTabs }
                delete copy[terminalEntityId]
                return copy
              })()
            : state.unreadTerminalTabs
        return {
          unifiedTabsByWorktree: opts?.preservePreview
            ? state.unifiedTabsByWorktree
            : {
                ...state.unifiedTabsByWorktree,
                [worktreeId]: (state.unifiedTabsByWorktree[worktreeId] ?? []).map((item) =>
                  item.id === tabId ? { ...item, isPreview: false } : item
                )
              },
          groupsByWorktree: {
            ...state.groupsByWorktree,
            [worktreeId]: (state.groupsByWorktree[worktreeId] ?? []).map((group) =>
              group.id === tab.groupId
                ? {
                    ...group,
                    activeTabId: tabId,
                    // Why: MRU tracks every activation within the group so
                    // closeUnifiedTab can jump back to the previous tab instead
                    // of the visual neighbor. Sanitize first to prune ids from
                    // removed tabs that may have lingered in persisted state.
                    recentTabIds: pushRecentTabId(
                      sanitizeRecentTabIds(group.recentTabIds, group.tabOrder),
                      tabId
                    )
                  }
                : group
            )
          },
          activeGroupIdByWorktree: {
            ...state.activeGroupIdByWorktree,
            [worktreeId]: tab.groupId
          },
          // Why: skip writing unreadTerminalTabs when the reference is unchanged —
          // avoids a no-op top-level state allocation that would force re-evaluation
          // of full-state selectors. Mirrors focusGroup / reconcileWorktreeTabModel.
          ...(nextUnreadTerminalTabs !== state.unreadTerminalTabs
            ? { unreadTerminalTabs: nextUnreadTerminalTabs }
            : {})
        }
      })
    }
  }
}
