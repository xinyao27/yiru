import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { updateSplitRatio, findSiblingGroupId } from './model'
import type { TabsSlice } from './slice'

export function createGroupLayoutActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<TabsSlice, 'mergeGroupIntoSibling' | 'setTabGroupSplitRatio'> {
  return {
    mergeGroupIntoSibling: (worktreeId, groupId) => {
      const state = get()
      const groups = state.groupsByWorktree[worktreeId] ?? []
      const sourceGroup = groups.find((candidate) => candidate.id === groupId)
      const layout = state.layoutByWorktree[worktreeId]
      if (!sourceGroup || !layout || groups.length <= 1) {
        return null
      }
      const targetGroupId = findSiblingGroupId(layout, groupId)
      if (!targetGroupId) {
        return null
      }

      const orderedSourceTabs = (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(
        (tab) => tab.groupId === groupId
      )
      for (const tabId of sourceGroup.tabOrder) {
        const item = orderedSourceTabs.find((tab) => tab.id === tabId)
        if (!item) {
          continue
        }
        get().moveUnifiedTabToGroup(item.id, targetGroupId, { recordInteraction: false })
      }
      get().closeEmptyGroup(worktreeId, groupId)
      get().recordFeatureInteraction?.('terminal-panes')
      return targetGroupId
    },
    setTabGroupSplitRatio: (worktreeId, nodePath, ratio) => {
      set((state) => {
        const currentLayout = state.layoutByWorktree[worktreeId]
        if (!currentLayout) {
          return {}
        }
        return {
          layoutByWorktree: {
            ...state.layoutByWorktree,
            // Why: split sizing is part of the tab-group model, not transient UI
            // state. Persisting ratios here keeps restores and multi-step group
            // operations in sync with what the user actually resized.
            [worktreeId]: updateSplitRatio(
              currentLayout,
              nodePath.length > 0 ? nodePath.split('.') : [],
              ratio
            )
          }
        }
      })
    }
  }
}
