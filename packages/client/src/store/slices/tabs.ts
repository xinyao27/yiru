import type { StateCreator } from 'zustand'
import type { TabSplitDirection } from '~renderer/lib/tab-split-direction'
import type { WorkspaceSessionHydrationOptions } from '~renderer/lib/workspace-session-hydration-keys'
import type {
  Tab,
  TabContentType,
  TabGroup,
  TabGroupLayoutNode,
  WorkspaceSessionState
} from '~shared/types'

import type { AppState } from '../types'
import { createActivationActions } from './tabs-activation-actions'
import { createCreateActions } from './tabs-create-actions'
import { createDropActions } from './tabs-drop-actions'
import { createGroupLayoutActions } from './tabs-group-layout-actions'
import { createGroupLifecycleActions } from './tabs-group-lifecycle-actions'
import { createHydrationActions } from './tabs-hydration-actions'
import { createMoveActions } from './tabs-move-actions'
import { createPinActions } from './tabs-pin-actions'
import { createReconciliationActions } from './tabs-reconciliation-actions'
import { createTabLifecycleActions } from './tabs-tab-lifecycle-actions'

export type { TabSplitDirection } from '~renderer/lib/tab-split-direction'
export { findSiblingGroupId } from './tabs-model'

export type TabsSlice = {
  unifiedTabsByWorktree: Record<string, Tab[]>
  // Why: signals the matching tab's inline title editor to open. A global
  // keyboard shortcut (tab.rename) sets this; the tab clears it on consume.
  renamingTabId: string | null
  groupsByWorktree: Record<string, TabGroup[]>
  activeGroupIdByWorktree: Record<string, string>
  layoutByWorktree: Record<string, TabGroupLayoutNode>
  createUnifiedTab: (
    worktreeId: string,
    contentType: TabContentType,
    init?: Partial<
      Pick<
        Tab,
        | 'id'
        | 'entityId'
        | 'label'
        | 'generatedLabel'
        | 'quickCommandLabel'
        | 'customLabel'
        | 'color'
        | 'isPreview'
        | 'isPinned'
      > & {
        targetGroupId: string
        activate: boolean
        recordInteraction: boolean
      }
    >
  ) => Tab
  createUnifiedTabInSplit: (
    worktreeId: string,
    contentType: TabContentType,
    target: {
      sourceGroupId: string
      splitDirection: TabSplitDirection
    },
    init?: Partial<
      Pick<
        Tab,
        | 'id'
        | 'entityId'
        | 'label'
        | 'generatedLabel'
        | 'quickCommandLabel'
        | 'customLabel'
        | 'color'
        | 'isPreview'
        | 'isPinned'
      > & {
        activate: boolean
        recordInteraction: boolean
      }
    >
  ) => Tab | null
  getTab: (tabId: string) => Tab | null
  getActiveTab: (worktreeId: string) => Tab | null
  findTabForEntityInGroup: (
    worktreeId: string,
    groupId: string,
    entityId: string,
    contentType?: TabContentType
  ) => Tab | null
  activateTab: (tabId: string, opts?: { preservePreview?: boolean }) => void
  closeUnifiedTab: (
    tabId: string,
    opts?: { recordInteraction?: boolean; terminalRetirementHandled?: boolean }
  ) => { closedTabId: string; wasLastTab: boolean; worktreeId: string } | null
  reorderUnifiedTabs: (
    groupId: string,
    tabIds: string[],
    opts?: { recordInteraction?: boolean }
  ) => void
  setTabLabel: (tabId: string, label: string) => void
  setTabCustomLabel: (
    tabId: string,
    label: string | null,
    opts?: { recordInteraction?: boolean }
  ) => void
  setUnifiedTabColor: (tabId: string, color: string | null) => void
  setRenamingTabId: (tabId: string | null) => void
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void
  closeOtherTabs: (tabId: string) => string[]
  closeTabsToRight: (tabId: string) => string[]
  ensureWorktreeRootGroup: (worktreeId: string) => string
  focusGroup: (worktreeId: string, groupId: string) => void
  closeEmptyGroup: (worktreeId: string, groupId: string) => boolean
  createEmptySplitGroup: (
    worktreeId: string,
    sourceGroupId: string,
    direction: TabSplitDirection
  ) => string | null
  moveUnifiedTabToGroup: (
    tabId: string,
    targetGroupId: string,
    opts?: { index?: number; activate?: boolean; recordInteraction?: boolean }
  ) => boolean
  dropUnifiedTab: (
    tabId: string,
    target: {
      groupId: string
      index?: number
      splitDirection?: TabSplitDirection
    }
  ) => boolean
  copyUnifiedTabToGroup: (
    tabId: string,
    targetGroupId: string,
    init?: Partial<
      Pick<
        Tab,
        | 'id'
        | 'entityId'
        | 'label'
        | 'generatedLabel'
        | 'quickCommandLabel'
        | 'customLabel'
        | 'color'
        | 'isPinned'
      >
    >
  ) => Tab | null
  mergeGroupIntoSibling: (worktreeId: string, groupId: string) => string | null
  setTabGroupSplitRatio: (worktreeId: string, nodePath: string, ratio: number) => void
  reconcileWorktreeTabModel: (worktreeId: string) => {
    renderableTabCount: number
    activeRenderableTabId: string | null
  }
  hydrateTabsSession: (
    session: WorkspaceSessionState,
    options?: WorkspaceSessionHydrationOptions
  ) => void
}

export const createTabsSlice: StateCreator<AppState, [], [], TabsSlice> = (set, get) => ({
  unifiedTabsByWorktree: {},
  renamingTabId: null,
  groupsByWorktree: {},
  activeGroupIdByWorktree: {},
  layoutByWorktree: {},

  ...createCreateActions(set, get),

  ...createActivationActions(set, get),

  ...createTabLifecycleActions(set, get),

  ...createPinActions(set, get),

  ...createGroupLifecycleActions(set, get),

  ...createMoveActions(set, get),

  ...createDropActions(set, get),

  ...createGroupLayoutActions(set, get),

  ...createReconciliationActions(set, get),

  ...createHydrationActions(set, get)
})
