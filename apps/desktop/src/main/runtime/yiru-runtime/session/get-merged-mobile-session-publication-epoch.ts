import { createHash } from 'node:crypto'

import type {
  RuntimeMobileSessionClientTab,
  RuntimeMobileSessionMarkdownTab,
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTabsRemovedResult,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot,
  BrowserTabInfo
} from '~shared/runtime-types'

import { RuntimeSessionSyncMobileSessionTabs } from './sync-mobile-session-tabs'

export abstract class RuntimeSessionGetMergedMobileSessionPublicationEpoch extends RuntimeSessionSyncMobileSessionTabs {
  protected getMergedMobileSessionPublicationEpoch(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    preservedTabs: readonly RuntimeMobileSessionSnapshotTab[]
  ): string {
    // Why: preserved snapshots can be merged repeatedly; normalize the prior
    // merge suffix before recomputing so the publication epoch is idempotent.
    const normalizedPublicationEpoch = snapshot.publicationEpoch.split(':headless-merge:')[0]
    const signature = createHash('sha1')
      .update(
        preservedTabs
          .map((tab) =>
            tab.type === 'terminal'
              ? `${tab.id}:${tab.parentTabId}:${tab.ptyId ?? ''}:${tab.leafId}`
              : tab.id
          )
          .join('|')
      )
      .digest('hex')
      .slice(0, 12)
    return `${normalizedPublicationEpoch}:headless-merge:${signature}`
  }

  protected notifyMobileSessionTabsRemoved(worktreeId: string): void {
    const removed: RuntimeMobileSessionTabsRemovedResult = {
      worktree: worktreeId,
      publicationEpoch: `removed:${Date.now().toString(36)}`,
      snapshotVersion: 0,
      removed: true,
      activeGroupId: null,
      activeTabId: null,
      activeTabType: null,
      tabs: []
    }
    for (const listener of this.mobileSessionTabListeners) {
      listener(removed)
    }
  }

  notifyMobileSessionTabsChanged(worktreeId?: string): void {
    if (!worktreeId) {
      this.notifyMobileSessionTabSnapshots()
      return
    }
    if (this.browserBackend) {
      const reconciled = this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
      // Why: hydrate already reconciles an existing snapshot in place; only
      // reconcile here when it didn't (fresh build or an early-returned hydrate).
      if (!reconciled.has(worktreeId)) {
        const existing = this.mobileSessionTabsByWorktree.get(worktreeId)
        if (existing) {
          this.reconcileHeadlessMobileSessionBrowserTabs(worktreeId, existing)
        }
      }
    }
    // Why: structural changes (tab add/remove/activate) must propagate promptly,
    // so cancel any pending coalesced title/status notify — this immediate emit
    // already reflects the latest snapshot and supersedes it.
    this.mobileSessionTabsNotifyCoalescer.cancel(worktreeId)
    this.notifyMobileSessionTabsChangedNow(worktreeId)
  }

  protected notifyMobileSessionTabsChangedNow(worktreeId: string): void {
    if (this.mobileSessionTabListeners.size === 0) {
      return
    }
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      return
    }
    // Why: browser bridge lifecycle events are already scoped by worktree; avoid
    // fanning out every active workspace snapshot during navigation/tab churn.
    const result = this.toMobileSessionTabsResult(snapshot)
    for (const listener of this.mobileSessionTabListeners) {
      listener(result)
    }
  }

  protected notifyMobileSessionTabSnapshots(): void {
    if (this.mobileSessionTabListeners.size === 0) {
      return
    }
    for (const snapshot of this.mobileSessionTabsByWorktree.values()) {
      const result = this.toMobileSessionTabsResult(snapshot)
      for (const listener of this.mobileSessionTabListeners) {
        listener(result)
      }
    }
  }

  protected getMobileSessionTabsForWorktree(worktreeId: string): RuntimeMobileSessionTabsResult {
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      return {
        worktree: worktreeId,
        publicationEpoch: 'none',
        snapshotVersion: 0,
        activeGroupId: null,
        activeTabId: null,
        activeTabType: null,
        tabs: []
      }
    }
    return this.toMobileSessionTabsResult(snapshot)
  }

  protected async resolveMobileMarkdownWorktreeId(
    worktreeSelector: string,
    tabId: string
  ): Promise<string> {
    const worktreeId =
      this.getValidatedExplicitWorktreeIdSelector(worktreeSelector) ??
      (await this.resolveWorktreeSelector(worktreeSelector)).id
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const tab = snapshot?.tabs.find(
      (candidate): candidate is RuntimeMobileSessionMarkdownTab =>
        candidate.type === 'markdown' && candidate.id === tabId
    )
    if (!tab) {
      throw new Error('tab_not_found')
    }
    return worktreeId
  }

  protected getLiveBrowserTabsByPageId(worktreeId: string): Map<string, BrowserTabInfo> {
    if (!this.agentBrowserBridge?.tabList) {
      return new Map()
    }
    const liveTabs = this.agentBrowserBridge.tabList(worktreeId).tabs
    return new Map(liveTabs.map((tab) => [tab.browserPageId, tab]))
  }

  protected collectReturnedSessionTabIds(
    tabs: readonly RuntimeMobileSessionClientTab[]
  ): Set<string> {
    const ids = new Set<string>()
    for (const tab of tabs) {
      ids.add(tab.id)
      if (tab.type === 'terminal') {
        ids.add(tab.parentTabId)
      } else if (tab.type === 'browser') {
        ids.add(tab.browserWorkspaceId)
      }
    }
    return ids
  }

  protected sanitizeMobileSessionTabGroups(
    groups: readonly RuntimeMobileSessionTabGroup[] | undefined,
    returnedTabs: readonly RuntimeMobileSessionClientTab[]
  ): RuntimeMobileSessionTabGroup[] | undefined {
    if (!groups || groups.length === 0) {
      return undefined
    }
    const returnedIds = this.collectReturnedSessionTabIds(returnedTabs)
    const sanitized = groups
      .map((group): RuntimeMobileSessionTabGroup | null => {
        const tabOrder = group.tabOrder.filter((tabId) => returnedIds.has(tabId))
        if (tabOrder.length === 0) {
          return null
        }
        const activeTabId =
          group.activeTabId && tabOrder.includes(group.activeTabId)
            ? group.activeTabId
            : (tabOrder[0] ?? null)
        const recentTabIds = group.recentTabIds?.filter((tabId) => tabOrder.includes(tabId))
        return {
          id: group.id,
          activeTabId,
          tabOrder,
          ...(recentTabIds && recentTabIds.length > 0 ? { recentTabIds } : {})
        }
      })
      .filter((group): group is RuntimeMobileSessionTabGroup => group !== null)
    return sanitized.length > 0 ? sanitized : undefined
  }
}
