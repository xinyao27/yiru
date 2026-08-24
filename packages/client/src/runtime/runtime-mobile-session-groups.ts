import type { AppState } from '~renderer/store/types'
import type { RuntimeMobileSessionTabGroup } from '~shared/runtime-types'
import type { Tab, TabGroup, TabGroupLayoutNode } from '~shared/types'

import {
  getActiveTabNavOrder,
  getGroupVisibleTabOrder,
  type VisibleTabRef
} from '../components/tab-bar/group-tab-order'

function isEditorSurfaceTab(tab: Pick<Tab, 'contentType'>): boolean {
  // Why: mobile file snapshots can faithfully mirror ordinary edit/diff files;
  // conflict review and check-details tabs require metadata this contract lacks.
  return tab.contentType === 'editor' || tab.contentType === 'diff'
}

export function getEditorUnifiedTabsForWorktree(
  state: Pick<AppState, 'unifiedTabsByWorktree'>,
  worktreeId: string
): Tab[] {
  return (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(isEditorSurfaceTab)
}

function applyUnifiedEditorTabIdsToLegacyOrder(
  order: readonly VisibleTabRef[],
  state: Pick<AppState, 'unifiedTabsByWorktree'>,
  worktreeId: string
): VisibleTabRef[] {
  const unifiedEditorTabs = getEditorUnifiedTabsForWorktree(state, worktreeId)
  if (unifiedEditorTabs.length === 0) {
    return [...order]
  }
  const firstUnifiedTabByFileId = new Map<string, string>()
  for (const tab of unifiedEditorTabs) {
    if (!firstUnifiedTabByFileId.has(tab.entityId)) {
      firstUnifiedTabByFileId.set(tab.entityId, tab.id)
    }
  }
  return order.map((item) => {
    if (item.type !== 'editor' || item.tabId) {
      return item
    }
    const tabId = firstUnifiedTabByFileId.get(item.id)
    return tabId ? { ...item, tabId } : item
  })
}

function collectTabGroupLayoutIds(layout: TabGroupLayoutNode | undefined): string[] {
  const result: string[] = []
  const visit = (node: TabGroupLayoutNode | undefined): void => {
    if (!node) {
      return
    }
    if (node.type === 'leaf') {
      result.push(node.groupId)
      return
    }
    visit(node.first)
    visit(node.second)
  }
  visit(layout)
  return result
}

export function pruneTabGroupLayout(
  layout: TabGroupLayoutNode | undefined,
  validGroupIds: ReadonlySet<string>
): TabGroupLayoutNode | null {
  if (!layout) {
    return null
  }
  if (layout.type === 'leaf') {
    return validGroupIds.has(layout.groupId) ? layout : null
  }
  const first = pruneTabGroupLayout(layout.first, validGroupIds)
  const second = pruneTabGroupLayout(layout.second, validGroupIds)
  if (first && second) {
    return { ...layout, first, second }
  }
  return first ?? second
}

function getOrderedTabGroups(
  groups: readonly TabGroup[],
  layout: TabGroupLayoutNode | undefined
): TabGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const seen = new Set<string>()
  const ordered: TabGroup[] = []
  for (const groupId of collectTabGroupLayoutIds(layout)) {
    const group = byId.get(groupId)
    if (!group || seen.has(group.id)) {
      continue
    }
    seen.add(group.id)
    ordered.push(group)
  }
  for (const group of groups) {
    if (!seen.has(group.id)) {
      ordered.push(group)
    }
  }
  return ordered
}

export function buildMobileSessionGroupProjection(
  state: AppState,
  worktreeId: string,
  ids: {
    terminalIds: string[]
    editorIds: string[]
    browserIds: string[]
  }
): {
  order: VisibleTabRef[]
  tabGroups?: RuntimeMobileSessionTabGroup[]
  tabGroupLayout?: TabGroupLayoutNode | null
} {
  const groups = state.groupsByWorktree[worktreeId] ?? []
  if (groups.length === 0) {
    return {
      order: applyUnifiedEditorTabIdsToLegacyOrder(
        getActiveTabNavOrder(state, worktreeId, {
          editorIds: ids.editorIds
        }),
        state,
        worktreeId
      )
    }
  }

  const terminalIds = new Set(ids.terminalIds)
  const editorIds = new Set(ids.editorIds)
  const browserIds = new Set(ids.browserIds)
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const order: VisibleTabRef[] = []
  const tabGroups: RuntimeMobileSessionTabGroup[] = []

  const layoutByWorktree = state.layoutByWorktree ?? {}
  for (const group of getOrderedTabGroups(groups, layoutByWorktree[worktreeId])) {
    const groupTabs = tabs.filter((tab) => tab.groupId === group.id)
    const visibleOrder = getGroupVisibleTabOrder(
      group,
      groupTabs,
      terminalIds,
      editorIds,
      browserIds
    )
    if (visibleOrder.length === 0) {
      continue
    }
    const tabOrder = visibleOrder.map((item) => item.tabId ?? item.id)
    const tabOrderSet = new Set(tabOrder)
    // Why: persisted split groups can contain very large tab orders; append
    // iteratively so mobile sync does not hit V8's argument-list limit.
    for (const item of visibleOrder) {
      order.push(item)
    }
    tabGroups.push({
      id: group.id,
      activeTabId:
        group.activeTabId && tabOrderSet.has(group.activeTabId) ? group.activeTabId : null,
      tabOrder,
      recentTabIds: group.recentTabIds?.filter((tabId) => tabOrderSet.has(tabId)) ?? []
    })
  }

  const validGroupIds = new Set(tabGroups.map((group) => group.id))
  return {
    order,
    tabGroups,
    tabGroupLayout: pruneTabGroupLayout(layoutByWorktree[worktreeId], validGroupIds)
  }
}
