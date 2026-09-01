import type {
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'

import { RuntimeTerminalBuildTerminalSummary } from '../terminal/build-terminal-summary'

export abstract class RuntimeSessionSyncMobileSessionTabs extends RuntimeTerminalBuildTerminalSummary {
  protected syncMobileSessionTabs(snapshots: RuntimeMobileSessionTabsSnapshot[] | undefined): void {
    if (snapshots === undefined) {
      return
    }
    // Why: renderer graphs are authoritative for renderer tabs, but headless
    // serve terminals never enter that graph unless we preserve their bindings.
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(undefined, {
      allowAttachedWindow: true,
      onlyServeOwnedTerminals: true
    })
    const nextWorktrees = new Set<string>()
    for (const snapshot of snapshots) {
      nextWorktrees.add(snapshot.worktree)
      const existing = this.mobileSessionTabsByWorktree.get(snapshot.worktree)
      const nextSnapshot = this.mergePreservedHeadlessMobileSessionTabs(snapshot, existing)
      if (
        !existing ||
        nextSnapshot.publicationEpoch !== existing.publicationEpoch ||
        nextSnapshot.snapshotVersion >= existing.snapshotVersion
      ) {
        this.mobileSessionTabsByWorktree.set(snapshot.worktree, nextSnapshot)
      }
    }
    for (const [worktreeId, existing] of this.mobileSessionTabsByWorktree) {
      if (!nextWorktrees.has(worktreeId)) {
        const preserved = this.buildPreservedHeadlessMobileSessionSnapshot(existing)
        if (preserved) {
          this.mobileSessionTabsByWorktree.set(worktreeId, preserved)
          nextWorktrees.add(worktreeId)
        } else {
          this.mobileSessionTabsByWorktree.delete(worktreeId)
          // Why: drop any pending coalesced notify so a stale snapshot can't
          // land after the removed frame.
          this.mobileSessionTabsNotifyCoalescer.cancel(worktreeId)
          this.notifyMobileSessionTabsRemoved(worktreeId)
        }
      }
    }
  }

  protected mergePreservedHeadlessMobileSessionTabs(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    existing: RuntimeMobileSessionTabsSnapshot | undefined
  ): RuntimeMobileSessionTabsSnapshot {
    if (!existing) {
      return snapshot
    }
    const preservedTabs = this.collectPreservedHeadlessMobileSessionTabs(existing, snapshot)
    if (preservedTabs.length === 0) {
      return snapshot
    }
    const hasIncomingActiveTab = snapshot.tabs.some((tab) => tab.isActive)
    const normalizedPreservedTabs = preservedTabs.map((tab) =>
      hasIncomingActiveTab ? { ...tab, isActive: false } : tab
    )
    const tabs = this.mergeMobileSessionSnapshotTabs(snapshot.tabs, normalizedPreservedTabs)
    if (tabs.length === snapshot.tabs.length) {
      return snapshot
    }
    const activeTab =
      snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ??
      tabs.find((tab) => tab.id === existing.activeTabId) ??
      tabs.find((tab) => tab.isActive) ??
      tabs[0] ??
      null
    const terminalTabs = tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
    )
    return {
      ...snapshot,
      publicationEpoch: this.getMergedMobileSessionPublicationEpoch(
        snapshot,
        normalizedPreservedTabs
      ),
      snapshotVersion: Math.max(snapshot.snapshotVersion, existing.snapshotVersion),
      activeGroupId: snapshot.activeGroupId ?? existing.activeGroupId,
      activeTabId: activeTab?.id ?? null,
      activeTabType: activeTab?.type ?? null,
      tabGroups: this.mergeMobileSessionTabGroups(
        snapshot.worktree,
        snapshot.tabGroups ?? existing.tabGroups ?? [],
        terminalTabs,
        activeTab?.type === 'terminal' ? activeTab : null
      ),
      tabs
    }
  }

  protected buildPreservedHeadlessMobileSessionSnapshot(
    existing: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionTabsSnapshot | null {
    const tabs = this.collectPreservedHeadlessMobileSessionTabs(existing)
    if (tabs.length === 0) {
      return null
    }
    const activeTab =
      tabs.find((tab) => tab.id === existing.activeTabId) ??
      tabs.find((tab) => tab.isActive) ??
      tabs[0] ??
      null
    const terminalTabs = tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
    )
    return {
      ...existing,
      publicationEpoch: this.getMergedMobileSessionPublicationEpoch(existing, tabs),
      activeGroupId:
        existing.activeGroupId ?? this.getHeadlessMobileSessionGroupId(existing.worktree),
      activeTabId: activeTab?.id ?? null,
      activeTabType: activeTab?.type ?? null,
      tabGroups: this.mergeMobileSessionTabGroups(
        existing.worktree,
        existing.tabGroups ?? [],
        terminalTabs,
        activeTab?.type === 'terminal' ? activeTab : null
      ),
      tabs
    }
  }

  protected collectPreservedHeadlessMobileSessionTabs(
    existing: RuntimeMobileSessionTabsSnapshot,
    incoming?: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionSnapshotTab[] {
    const incomingIds = new Set(
      incoming?.tabs.flatMap((tab) => this.getMobileSessionSnapshotTabIdentityKeys(tab)) ?? []
    )
    return existing.tabs.filter((tab) => {
      if (this.getMobileSessionSnapshotTabIdentityKeys(tab).some((id) => incomingIds.has(id))) {
        return false
      }
      return this.shouldPreserveHeadlessMobileSessionTab(existing, tab)
    })
  }

  protected shouldPreserveHeadlessMobileSessionTab(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionSnapshotTab
  ): boolean {
    if (tab.type === 'browser') {
      return false
    }
    if (tab.type !== 'terminal') {
      return false
    }
    // Why: a genuinely-headless host (no connected workbench) has no live
    // graph to check against, so the whole-snapshot "headless" origin is the
    // only signal available and every one of its terminals is preserved.
    // Once a workbench is connected, that origin stops being trustworthy: a
    // worktree's mobile snapshot can be seeded once, on first activation, from
    // the *persisted* (possibly stale/closed) workspace session — see
    // hydrateHeadlessMobileSessionTabsFromWorkspaceSession — and every tab it
    // produced is stamped with the same 'headless-hydrated:' epoch forever
    // after. Falling back to that stamp here would keep resurrecting closed
    // tabs on every later live-renderer merge (#duplicate-mobile-tabs). With a
    // workbench connected, require either genuine serve/ssh ownership or current
    // membership in the live workbench graph, matching
    // isRuntimeOwnedHeadlessMobileTab's same discriminator.
    if (!this.hasAvailableWorkbench()) {
      return this.isHeadlessMobileSessionPublication(snapshot.publicationEpoch)
    }
    return this.hasServeOwnedPtyBinding(tab) || this.terminalSessions.hasGraphTab(tab.parentTabId)
  }

  protected isHeadlessMobileSessionPublication(publicationEpoch: string): boolean {
    return (
      publicationEpoch.startsWith('headless:') ||
      publicationEpoch.startsWith('headless-hydrated:') ||
      publicationEpoch.includes(':headless-merge:')
    )
  }
}
