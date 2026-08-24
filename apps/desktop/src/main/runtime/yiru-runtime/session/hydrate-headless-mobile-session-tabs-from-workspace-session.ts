import { LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import {
  collectLiveRepoIdsForHost,
  shouldHydratePersistedWorktreeSession
} from '~main/runtime/headless-session-repo-hydration'
import type {
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionBrowserTab
} from '~shared/runtime-types'

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
    if (this.getAvailableAuthoritativeWindow() && options.allowAttachedWindow !== true) {
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
        // Why: terminals are stable/persisted so we normally skip a rebuild, but
        // offscreen browser tabs are live and may have been created/closed since.
        // Reconcile just the browser tabs against the live bridge instead of
        // leaving a stale snapshot that omits a freshly-opened browser tab.
        this.reconcileHeadlessMobileSessionBrowserTabs(entryWorktreeId, existing)
        reconciledWorktreeIds.add(entryWorktreeId)
        continue
      }
      // Why: with a window attached, the live renderer graph is authoritative.
      // The persisted (disk) session can lag a closed tab — it is written on a
      // debounce, not synchronously on every close — so seeding straight from
      // it here would publish stale/closed tabs to mobile. Once seeded they
      // used to be preserved forever by shouldPreserveHeadlessMobileSessionTab
      // regardless of liveness; that hole is now closed there too, but not
      // publishing them in the first place avoids even the one-sync flash.
      const hasAttachedWindow = Boolean(this.getAvailableAuthoritativeWindow())
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
      // Why: offscreen browser panes are live-only (no persisted session entry),
      // so include them on every hydrate regardless of the onlyServeOwnedTerminals
      // filter, which is about terminal PTY ownership and never applies to browsers.
      const browserTabs = this.buildHeadlessMobileSessionBrowserTabs(entryWorktreeId)
      const tabs: RuntimeMobileSessionSnapshotTab[] = [...terminalTabs, ...browserTabs]
      if (tabs.length === 0) {
        continue
      }
      const activeTab = this.pickHeadlessActiveTerminalTab(terminalTabs)
      const tabOrder = [
        ...this.collectHeadlessParentTabOrder(terminalTabs),
        ...browserTabs.map((tab) => tab.id)
      ]
      const groupId = this.getHeadlessMobileSessionGroupId(entryWorktreeId)
      const mergedTabs =
        options.onlyServeOwnedTerminals === true && existing
          ? this.mergeMobileSessionSnapshotTabs(existing.tabs, tabs)
          : tabs
      const mergedActiveTab =
        existing?.tabs.find((tab) => tab.id === existing.activeTabId) ??
        activeTab ??
        mergedTabs[0] ??
        null
      const mergedTerminalTabs = mergedTabs.filter(
        (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
      )
      const mergedBrowserOrder = mergedTabs
        .filter((tab): tab is RuntimeMobileSessionBrowserTab => tab.type === 'browser')
        .map((tab) => tab.id)
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
          ? this.appendBrowserTabOrder(
              this.distributeHeadlessTabsAcrossGroups(
                persistedGroups.map((group) => ({
                  id: group.id,
                  activeTabId: group.activeTabId,
                  tabOrder: [...group.tabOrder],
                  ...(group.recentTabIds ? { recentTabIds: [...group.recentTabIds] } : {})
                })),
                this.collectHeadlessParentTabOrder(mergedTerminalTabs),
                activeTopLevelId
              ),
              mergedBrowserOrder,
              undefined,
              // Why: distribute drops browser ids (terminal-only), so carry each
              // browser's persisted group forward instead of coalescing left.
              this.collectBrowserGroupAssignment(persistedGroups, mergedBrowserOrder)
            )
          : options.onlyServeOwnedTerminals === true && existing?.tabGroups
            ? this.appendBrowserTabOrder(
                this.mergeMobileSessionTabGroups(
                  entryWorktreeId,
                  existing.tabGroups,
                  mergedTerminalTabs,
                  mergedActiveTab?.type === 'terminal' ? mergedActiveTab : null
                ),
                mergedBrowserOrder
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

  // Why: keep an existing snapshot's browser tabs in sync with the live bridge
  // without rebuilding stable terminal state. Replaces browser entries with the
  // current live set and rewrites the browser portion of the primary group order.
}
