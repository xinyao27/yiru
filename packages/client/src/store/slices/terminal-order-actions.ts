import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import type { TerminalSlice } from './terminals'

export function createTerminalOrderActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<
  TerminalSlice,
  'reorderTabs' | 'setTabBarOrder' | 'setActiveTab' | 'setActiveTabForWorktree'
> {
  return {
    reorderTabs: (worktreeId, tabIds) => {
      set((s) => {
        const tabs = s.tabsByWorktree[worktreeId] ?? []
        const tabMap = new Map(tabs.map((t) => [t.id, t]))
        const orderedSet = new Set(tabIds)
        const missingTabs = tabs.filter((t) => !orderedSet.has(t.id))

        const reordered = [
          ...tabIds.map((id) => tabMap.get(id)!).filter(Boolean),
          ...missingTabs
        ].map((tab, i) => ({ ...tab, sortOrder: i }))

        return {
          tabsByWorktree: { ...s.tabsByWorktree, [worktreeId]: reordered }
        }
      })
    },
    setTabBarOrder: (worktreeId, order) => {
      set((s) => {
        // Update unified visual order
        const newTabBarOrder = { ...s.tabBarOrderByWorktree, [worktreeId]: order }

        // Keep terminal tab sortOrder in sync for persistence
        const tabs = s.tabsByWorktree[worktreeId]
        if (!tabs) {
          return { tabBarOrderByWorktree: newTabBarOrder }
        }
        const tabMap = new Map(tabs.map((t) => [t.id, t]))
        // Extract terminal IDs in their new relative order
        const terminalIdsInOrder = order.filter((id) => tabMap.has(id))
        const orderedSet = new Set(terminalIdsInOrder)
        const missingTabs = tabs.filter((t) => !orderedSet.has(t.id))

        const updatedTabs = [
          ...terminalIdsInOrder.map((id) => tabMap.get(id)!).filter(Boolean),
          ...missingTabs
        ].map((tab, i) => ({ ...tab, sortOrder: i }))

        return {
          tabBarOrderByWorktree: newTabBarOrder,
          tabsByWorktree: { ...s.tabsByWorktree, [worktreeId]: updatedTabs }
        }
      })
    },
    setActiveTab: (tabId) => {
      set((s) => {
        // Why: focusing a terminal tab clears the tab-level bell — the user has
        // moved to this tab.
        //
        // Why (activeWorktree guard below): only clear when the tab belongs to
        // the active worktree. If setActiveTab is invoked with a tab from a
        // background worktree (e.g., during worktree activation, or the
        // "jump to agent" path), the tab is not yet visible and clearing would
        // silently swallow the signal. Mirrors the guard in activateTab and
        // focusGroup.
        let tabOwnerWorktreeId: string | null = null
        for (const [wId, tabs] of Object.entries(s.tabsByWorktree)) {
          if (tabs.some((t) => t.id === tabId)) {
            tabOwnerWorktreeId = wId
            break
          }
        }
        const nextUnreadTerminalTabs =
          tabOwnerWorktreeId === s.activeWorktreeId && s.unreadTerminalTabs[tabId]
            ? (() => {
                const copy = { ...s.unreadTerminalTabs }
                delete copy[tabId]
                return copy
              })()
            : s.unreadTerminalTabs
        // Why: only write the global activeTabId when the tab belongs to the
        // currently active worktree. markTerminalTabUnread treats activeTabId
        // as "the tab the user is looking at" and suppresses BELs on it; if we
        // pinned activeTabId to a background-worktree tab (e.g. the
        // jump-to-agent path calls setActiveTab before switching worktrees),
        // a subsequent BEL on that tab would be silently swallowed. The
        // per-worktree map still gets updated so the background worktree
        // remembers its last-active tab for later restoration. Mirrors the
        // pattern already used above for nextUnreadTerminalTabs.
        const isActiveWorktreeTab = tabOwnerWorktreeId === s.activeWorktreeId
        return {
          activeTabId: isActiveWorktreeTab ? tabId : s.activeTabId,
          activeTabIdByWorktree: tabOwnerWorktreeId
            ? { ...s.activeTabIdByWorktree, [tabOwnerWorktreeId]: tabId }
            : s.activeTabIdByWorktree,
          unreadTerminalTabs: nextUnreadTerminalTabs
        }
      })
      const item = Object.values(get().unifiedTabsByWorktree)
        .flat()
        .find((entry) => entry.contentType === 'terminal' && entry.entityId === tabId)
      if (item) {
        get().activateTab(item.id)
      }
    },
    setActiveTabForWorktree: (worktreeId, tabId) => {
      set((s) => ({
        activeTabIdByWorktree: {
          ...s.activeTabIdByWorktree,
          [worktreeId]: tabId
        }
      }))
    }
  }
}
