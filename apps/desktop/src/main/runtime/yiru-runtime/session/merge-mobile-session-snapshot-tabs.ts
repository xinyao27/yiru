import type {
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab
} from '~shared/runtime-types'

import { RuntimeSessionReconcileHeadlessMobileSessionBrowserTabs } from './reconcile-headless-mobile-session-browser-tabs'

export abstract class RuntimeSessionMergeMobileSessionSnapshotTabs extends RuntimeSessionReconcileHeadlessMobileSessionBrowserTabs {
  protected mergeMobileSessionSnapshotTabs(
    baseTabs: readonly RuntimeMobileSessionSnapshotTab[],
    extraTabs: readonly RuntimeMobileSessionSnapshotTab[]
  ): RuntimeMobileSessionSnapshotTab[] {
    const seenIds = new Set<string>()
    const merged: RuntimeMobileSessionSnapshotTab[] = []
    const add = (tab: RuntimeMobileSessionSnapshotTab): void => {
      const ids = this.getMobileSessionSnapshotTabIdentityKeys(tab)
      if (ids.some((id) => seenIds.has(id))) {
        return
      }
      for (const id of ids) {
        seenIds.add(id)
      }
      merged.push(tab)
    }
    for (const tab of baseTabs) {
      add(tab)
    }
    for (const tab of extraTabs) {
      add(tab)
    }
    return merged
  }

  protected getMobileSessionSnapshotTabIdentityKeys(
    tab: RuntimeMobileSessionSnapshotTab
  ): string[] {
    if (tab.type === 'terminal') {
      // Why: split terminal leaves share one parent tab; merge dedup must stay
      // leaf-scoped or preserved siblings collapse into a single surface.
      const keys = [tab.id, `${tab.parentTabId}::${tab.leafId}`]
      if (typeof tab.ptyId === 'string' && tab.ptyId.length > 0) {
        // Why: renderer and headless sources can derive different leafIds for the same
        // terminal; real PTYs collapse those duplicates without merging pending splits.
        keys.push(`${tab.parentTabId}::pty:${tab.ptyId}`)
      }
      return keys
    }
    if (tab.type === 'browser') {
      return [tab.id, tab.browserWorkspaceId]
    }
    return [tab.id]
  }

  protected mergeMobileSessionTabGroups(
    worktreeId: string,
    groups: readonly RuntimeMobileSessionTabGroup[],
    terminalTabs: readonly RuntimeMobileSessionTerminalTab[],
    activeTab: RuntimeMobileSessionTerminalTab | null
  ): RuntimeMobileSessionTabGroup[] {
    const parentTabOrder = this.collectHeadlessParentTabOrder(terminalTabs)
    if (parentTabOrder.length === 0) {
      return [...groups]
    }
    const targetGroupId = groups[0]?.id ?? this.getHeadlessMobileSessionGroupId(worktreeId)
    const nextGroups =
      groups.length > 0
        ? groups.map((group) => ({ ...group, tabOrder: [...group.tabOrder] }))
        : [
            {
              id: targetGroupId,
              activeTabId: null,
              tabOrder: []
            }
          ]
    // Why: keep each tab in the group that already owns it (a multi-group split
    // must survive the merge), drop tabs no longer present, and route only
    // genuinely-new tabs into the active group — never funnel everything into
    // group[0], which duplicated/coalesced tabs that lived in other groups.
    const ownerGroupId = new Map<string, string>()
    for (const group of nextGroups) {
      for (const tabId of group.tabOrder) {
        ownerGroupId.set(tabId, group.id)
      }
    }
    const liveTabIds = new Set(parentTabOrder)
    const activeParentId = activeTab?.parentTabId ?? null
    const activeGroupId =
      (activeParentId ? ownerGroupId.get(activeParentId) : undefined) ?? nextGroups[0]!.id
    const retainedOrder = new Map<string, string[]>(nextGroups.map((group) => [group.id, []]))
    for (const tabId of parentTabOrder) {
      const groupId = ownerGroupId.get(tabId) ?? activeGroupId
      retainedOrder.get(groupId)?.push(tabId)
    }
    return nextGroups
      .map((group) => {
        const tabOrder = retainedOrder.get(group.id) ?? []
        const keptActive =
          group.activeTabId &&
          tabOrder.includes(group.activeTabId) &&
          liveTabIds.has(group.activeTabId)
            ? group.activeTabId
            : null
        return {
          ...group,
          tabOrder,
          activeTabId:
            activeParentId && tabOrder.includes(activeParentId)
              ? activeParentId
              : (keptActive ?? tabOrder[0] ?? null)
        }
      })
      .filter((group) => group.tabOrder.length > 0)
  }

  /**
   * Publishes a PTY-backed terminal tab snapshot to the synced mobile session,
   * normalizing Pi-compatible titles based on launch or foreground ownership.
   */
}
