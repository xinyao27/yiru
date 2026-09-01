import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { findGroupForTab, findTabAndWorktree, updateGroup } from './group-state'
import {
  patchTerminalTabPinned,
  mirrorTabPinnedToHost,
  partitionPinnedTabOrder,
  applyTabOrderSortValues
} from './model'
import type { TabsSlice } from './slice'

export function createPinActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<TabsSlice, 'pinTab' | 'unpinTab' | 'closeOtherTabs' | 'closeTabsToRight'> {
  return {
    pinTab: (tabId) => {
      const exists = get().getTab(tabId) !== null
      set((state) => {
        const found = findTabAndWorktree(state.unifiedTabsByWorktree, tabId)
        if (!found) {
          return {}
        }
        const { tab, worktreeId } = found
        const tabs = (state.unifiedTabsByWorktree[worktreeId] ?? []).map((candidate) =>
          candidate.id === tabId ? { ...candidate, isPinned: true, isPreview: false } : candidate
        )
        const groups = state.groupsByWorktree[worktreeId] ?? []
        const group = groups.find((candidate) => candidate.id === tab.groupId)
        if (!group) {
          return {
            unifiedTabsByWorktree: { ...state.unifiedTabsByWorktree, [worktreeId]: tabs }
          }
        }
        const tabOrder = partitionPinnedTabOrder(group.tabOrder, tabs, tabId)
        return {
          unifiedTabsByWorktree: {
            ...state.unifiedTabsByWorktree,
            [worktreeId]: applyTabOrderSortValues(tabs, tabOrder)
          },
          // Why: reconcile derives a tab's pin from the TerminalTab (tabsByWorktree),
          // so mirror the pin there too — otherwise an unrelated host snapshot
          // recomputes isPinned:false and visually un-pins during the echo window.
          ...patchTerminalTabPinned(state.tabsByWorktree, worktreeId, tabId, true),
          groupsByWorktree: {
            ...state.groupsByWorktree,
            [worktreeId]: updateGroup(groups, { ...group, tabOrder })
          }
        }
      })
      mirrorTabPinnedToHost(get(), tabId, true)
      if (exists) {
        get().recordFeatureInteraction?.('terminal-tabs')
      }
    },
    unpinTab: (tabId) => {
      const exists = get().getTab(tabId) !== null
      set((state) => {
        const found = findTabAndWorktree(state.unifiedTabsByWorktree, tabId)
        if (!found) {
          return {}
        }
        const { tab, worktreeId } = found
        const tabs = (state.unifiedTabsByWorktree[worktreeId] ?? []).map((candidate) =>
          candidate.id === tabId ? { ...candidate, isPinned: false } : candidate
        )
        const groups = state.groupsByWorktree[worktreeId] ?? []
        const group = groups.find((candidate) => candidate.id === tab.groupId)
        if (!group) {
          return {
            unifiedTabsByWorktree: { ...state.unifiedTabsByWorktree, [worktreeId]: tabs }
          }
        }
        const tabOrder = partitionPinnedTabOrder(group.tabOrder, tabs, tabId)
        return {
          unifiedTabsByWorktree: {
            ...state.unifiedTabsByWorktree,
            [worktreeId]: applyTabOrderSortValues(tabs, tabOrder)
          },
          ...patchTerminalTabPinned(state.tabsByWorktree, worktreeId, tabId, false),
          groupsByWorktree: {
            ...state.groupsByWorktree,
            [worktreeId]: updateGroup(groups, { ...group, tabOrder })
          }
        }
      })
      mirrorTabPinnedToHost(get(), tabId, false)
      if (exists) {
        get().recordFeatureInteraction?.('terminal-tabs')
      }
    },
    closeOtherTabs: (tabId) => {
      const state = get()
      const found = findTabAndWorktree(state.unifiedTabsByWorktree, tabId)
      if (!found) {
        return []
      }
      const { tab, worktreeId } = found
      const group = findGroupForTab(state.groupsByWorktree, worktreeId, tab.groupId)
      if (!group) {
        return []
      }
      const closedIds = (state.unifiedTabsByWorktree[worktreeId] ?? [])
        .filter((item) => item.groupId === group.id && item.id !== tabId && !item.isPinned)
        .map((item) => item.id)
      for (const id of closedIds) {
        get().closeUnifiedTab(id)
      }
      return closedIds
    },
    closeTabsToRight: (tabId) => {
      const state = get()
      const found = findTabAndWorktree(state.unifiedTabsByWorktree, tabId)
      if (!found) {
        return []
      }
      const { tab, worktreeId } = found
      const group = findGroupForTab(state.groupsByWorktree, worktreeId, tab.groupId)
      if (!group) {
        return []
      }
      const index = group.tabOrder.indexOf(tabId)
      if (index === -1) {
        return []
      }
      const closableIds = group.tabOrder
        .slice(index + 1)
        .filter(
          (id) =>
            !(state.unifiedTabsByWorktree[worktreeId] ?? []).find(
              (candidate) => candidate.id === id
            )?.isPinned
        )
      for (const id of closableIds) {
        get().closeUnifiedTab(id)
      }
      return closableIds
    }
  }
}
