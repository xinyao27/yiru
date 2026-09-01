import { LOCAL_EXECUTION_HOST_ID } from '@yiru/runtime-protocol/model/workspace'
import type {
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab
} from '@yiru/runtime-protocol/workbench/runtime-types'
import {
  collectLiveRepoIdsForHost,
  shouldHydratePersistedWorktreeSession
} from '~main/runtime/headless-session-repo-hydration'

import { RuntimeSessionAttachWindow } from './attach-window'

export abstract class RuntimeSessionHydrateHeadlessMobileSessionTabsFromWorkspaceSession extends RuntimeSessionAttachWindow {
  protected hydrateHeadlessMobileSessionTabsFromWorkspaceSession(
    worktreeId?: string,
    options: {
      force?: boolean
      allowAttachedWindow?: boolean
      onlyServeOwnedTerminals?: boolean
    } = {}
  ): Set<string> {
    // Why: report which worktrees were reconciled in place so callers don't
    // reconcile them a second time (see notifyMobileSessionTabsChanged).
    const reconciledWorktreeIds = new Set<string>()
    if (this.hasAvailableWorkbench() && options.allowAttachedWindow !== true) {
      return reconciledWorktreeIds
    }
    const session = this.store?.getWorkspaceSession?.()
    if (!session) {
      return reconciledWorktreeIds
    }
    const entries =
      worktreeId !== undefined
        ? ([[worktreeId, session.tabsByWorktree[worktreeId] ?? []]] as const)
        : Object.entries(session.tabsByWorktree ?? {})
    const liveRepoIds = collectLiveRepoIdsForHost(
      this.store?.getRepos() ?? [],
      LOCAL_EXECUTION_HOST_ID
    )
    for (const [entryWorktreeId, persistedTabs] of entries) {
      if (!shouldHydratePersistedWorktreeSession(entryWorktreeId, liveRepoIds)) {
        continue
      }
      const existing = this.mobileSessionTabsByWorktree.get(entryWorktreeId)
      if (
        existing &&
        existing.tabs.length > 0 &&
        options.force !== true &&
        options.onlyServeOwnedTerminals !== true
      ) {
        // Why: old releases could persist embedded-browser tabs. The Chrome
        // extension owns real tabs now, so prune those legacy session entries.
        this.reconcileHeadlessMobileSessionBrowserTabs(entryWorktreeId, existing)
        reconciledWorktreeIds.add(entryWorktreeId)
        continue
      }
      // Why: with a workbench connected, its live graph is authoritative.
      // The persisted (disk) session can lag a closed tab — it is written on a
      // debounce, not synchronously on every close — so seeding straight from
      // it here would publish stale/closed tabs to mobile. Once seeded they
      // used to be preserved forever by shouldPreserveHeadlessMobileSessionTab
      // regardless of liveness; that hole is now closed there too, but not
      // publishing them in the first place avoids even the one-sync flash.
      const hasAttachedWindow = this.hasAvailableWorkbench()
      const terminalTabs = this.buildHeadlessMobileSessionTerminalTabs(
        entryWorktreeId,
        persistedTabs
      ).filter((tab) => {
        if (options.onlyServeOwnedTerminals === true && !this.hasServeOwnedPtyBinding(tab)) {
          return false
        }
        if (!hasAttachedWindow) {
          return true
        }
        return (
          this.hasServeOwnedPtyBinding(tab) || this.terminalSessions.hasGraphTab(tab.parentTabId)
        )
      })
      const tabs: RuntimeMobileSessionSnapshotTab[] = terminalTabs
      if (tabs.length === 0) {
        continue
      }
      const activeTab = this.pickHeadlessActiveTerminalTab(terminalTabs)
      const tabOrder = this.collectHeadlessParentTabOrder(terminalTabs)
      const groupId = this.getHeadlessMobileSessionGroupId(entryWorktreeId)
      const mergedTabs =
        options.onlyServeOwnedTerminals === true && existing
          ? this.mergeMobileSessionSnapshotTabs(
              existing.tabs.filter((tab) => tab.type !== 'browser'),
              tabs
            )
          : tabs
      const mergedActiveTab =
        existing?.tabs.find((tab) => tab.type !== 'browser' && tab.id === existing.activeTabId) ??
        activeTab ??
        mergedTabs[0] ??
        null
      const mergedTerminalTabs = mergedTabs.filter(
        (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
      )
      // Why: a persisted multi-group split must be restored on cold rebuild, or
      // the headless serve coalesces the user's group layout back into one group
      // (the persisted tabGroups/tabGroupLayouts would otherwise be write-only).
      const persistedGroups = session.tabGroups?.[entryWorktreeId]
      const persistedLayout = session.tabGroupLayouts?.[entryWorktreeId]
      const hasPersistedSplit =
        options.onlyServeOwnedTerminals !== true &&
        persistedGroups !== undefined &&
        persistedGroups.length > 1
      const activeTopLevelId = mergedActiveTab
        ? mergedActiveTab.type === 'terminal'
          ? mergedActiveTab.parentTabId
          : mergedActiveTab.id
        : null
      this.mobileSessionTabsByWorktree.set(entryWorktreeId, {
        worktree: existing?.worktree ?? entryWorktreeId,
        publicationEpoch: `headless-hydrated:${Date.now().toString(36)}`,
        snapshotVersion: (existing?.snapshotVersion ?? 0) + 1,
        activeGroupId: existing?.activeGroupId ?? groupId,
        activeTabId: mergedActiveTab?.id ?? null,
        activeTabType: mergedActiveTab?.type ?? null,
        tabGroups: hasPersistedSplit
          ? this.distributeHeadlessTabsAcrossGroups(
              persistedGroups.map((group) => ({
                id: group.id,
                activeTabId: group.activeTabId,
                tabOrder: [...group.tabOrder],
                ...(group.recentTabIds ? { recentTabIds: [...group.recentTabIds] } : {})
              })),
              this.collectHeadlessParentTabOrder(mergedTerminalTabs),
              activeTopLevelId
            )
          : options.onlyServeOwnedTerminals === true && existing?.tabGroups
            ? this.mergeMobileSessionTabGroups(
                entryWorktreeId,
                existing.tabGroups,
                mergedTerminalTabs,
                mergedActiveTab?.type === 'terminal' ? mergedActiveTab : null
              )
            : [
                {
                  id: groupId,
                  activeTabId: mergedActiveTab?.id
                    ? (activeTab?.parentTabId ?? mergedActiveTab.id)
                    : (tabOrder[0] ?? null),
                  tabOrder
                }
              ],
        ...(hasPersistedSplit && persistedLayout ? { tabGroupLayout: persistedLayout } : {}),
        tabs: mergedTabs
      })
    }
    return reconciledWorktreeIds
  }

  // Why: retained snapshots may contain pre-extension embedded-browser tabs.
}
