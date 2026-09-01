import type { RuntimeAgentStatusEvent } from '@yiru/runtime-protocol/contract'
import { normalizeCompatibleAgentTitleForOwner } from '@yiru/runtime-protocol/workbench/agent/title-owner'
import type {
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'

import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { getLatestPtyTitle } from '../model/worktree-status'
import { RuntimeSessionMergeMobileSessionSnapshotTabs } from './merge-mobile-session-snapshot-tabs'

export abstract class RuntimeSessionPublishPtyBackedMobileSessionTerminal extends RuntimeSessionMergeMobileSessionSnapshotTabs {
  protected publishPtyBackedMobileSessionTerminal(
    worktreeId: string,
    pty: RuntimePtyWorktreeRecord,
    args: {
      tabId: string
      leafId: string
      title: string | null
      activate: boolean
      selectIfNoActiveTab?: boolean
      startupCwd?: string
      split?: { splitFromLeafId: string; direction: 'horizontal' | 'vertical' }
    }
  ): void {
    const existing = this.mobileSessionTabsByWorktree.get(worktreeId)
    const ownerAgent = pty.launchAgent ?? pty.foregroundAgent
    const title = normalizeCompatibleAgentTitleForOwner(
      args.title ?? getLatestPtyTitle(pty) ?? 'Terminal',
      ownerAgent
    )
    const existingTab = existing?.tabs.find(
      (candidate): candidate is RuntimeMobileSessionTerminalTab =>
        candidate.type === 'terminal' &&
        candidate.parentTabId === args.tabId &&
        candidate.leafId === args.leafId
    )
    // Why: a split inserts into the parent tab's layout, which lives on the
    // sibling surface, not this new leaf's (empty) existing surface.
    const baseLayout = args.split
      ? (existing?.tabs.find(
          (candidate): candidate is RuntimeMobileSessionTerminalTab =>
            candidate.type === 'terminal' &&
            candidate.parentTabId === args.tabId &&
            candidate.leafId === args.split!.splitFromLeafId
        )?.parentLayout ?? existingTab?.parentLayout)
      : existingTab?.parentLayout
    const parentLayout = this.buildMaterializedHeadlessParentLayout(
      args.leafId,
      pty.ptyId,
      baseLayout,
      args.split
    )
    const tab: RuntimeMobileSessionTerminalTab = {
      type: 'terminal',
      id: `${args.tabId}::${args.leafId}`,
      parentTabId: args.tabId,
      leafId: args.leafId,
      ptyId: pty.ptyId,
      title,
      ...(pty.launchAgent ? { launchAgent: pty.launchAgent } : {}),
      ...(args.startupCwd ? { startupCwd: args.startupCwd } : {}),
      parentLayout,
      isActive:
        args.activate || (args.selectIfNoActiveTab !== false && existing?.activeTabId == null)
    }
    const existingTabs = (existing?.tabs ?? []).filter(
      (candidate) =>
        !(
          candidate.type === 'terminal' &&
          candidate.parentTabId === args.tabId &&
          candidate.leafId === args.leafId
        )
    )
    const tabs = this.mergeMobileSessionSnapshotTabs(
      existingTabs.map((candidate) => ({
        ...candidate,
        // Why: the client picks one sibling's parentLayout to render the whole
        // tab; a split must update every sibling surface to the new tree, or a
        // stale single-leaf sibling makes the client fall back to a default
        // direction ("Split Right" renders as down).
        ...(args.split && candidate.type === 'terminal' && candidate.parentTabId === args.tabId
          ? { parentLayout }
          : {}),
        isActive: tab.isActive ? false : candidate.isActive
      })),
      [tab]
    )
    const activeTab =
      (tab.isActive ? tab : tabs.find((candidate) => candidate.id === existing?.activeTabId)) ??
      tabs.find((candidate) => candidate.isActive) ??
      (args.selectIfNoActiveTab !== false ? tabs[0] : null) ??
      null
    const terminalTabs = tabs.filter(
      (candidate): candidate is RuntimeMobileSessionTerminalTab => candidate.type === 'terminal'
    )
    const next: RuntimeMobileSessionTabsSnapshot = {
      worktree: worktreeId,
      publicationEpoch:
        existing?.publicationEpoch ?? `headless:pty-backed:${Date.now().toString(36)}`,
      snapshotVersion: (existing?.snapshotVersion ?? 0) + 1,
      activeGroupId: existing?.activeGroupId ?? this.getHeadlessMobileSessionGroupId(worktreeId),
      activeTabId: activeTab?.id ?? null,
      activeTabType: activeTab?.type ?? null,
      tabGroups: this.mergeMobileSessionTabGroups(
        worktreeId,
        existing?.tabGroups ?? [],
        terminalTabs,
        activeTab?.type === 'terminal' ? activeTab : null
      ),
      ...(existing?.tabGroupLayout ? { tabGroupLayout: existing.tabGroupLayout } : {}),
      tabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, next)
    this.notifyMobileSessionTabsChanged(worktreeId)
  }

  protected touchMobileSessionSnapshotsForPty(
    ptyId: string,
    options: { immediate?: boolean } = {}
  ): void {
    for (const [worktreeId, snapshot] of this.mobileSessionTabsByWorktree) {
      const hasPtyBackedTab = snapshot.tabs.some(
        (tab) =>
          tab.type === 'terminal' &&
          (tab.ptyId === ptyId || tab.parentLayout?.ptyIdsByLeafId?.[tab.leafId] === ptyId)
      )
      if (!hasPtyBackedTab) {
        continue
      }
      this.mobileSessionTabsByWorktree.set(worktreeId, {
        ...snapshot,
        snapshotVersion: snapshot.snapshotVersion + 1
      })
      if (options.immediate) {
        // Why: readiness/lifecycle changes are structural and must not wait
        // behind the title/status coalescing window.
        this.notifyMobileSessionTabsChanged(worktreeId)
      } else {
        // Why: title/status flips several times a second under spinner-in-title
        // agents. Coalesce the emit instead of fanning out every version.
        this.mobileSessionTabsNotifyCoalescer.schedule(worktreeId)
      }
    }
  }

  protected touchMobileSessionSnapshotsForAgentStatus(event: RuntimeAgentStatusEvent): void {
    let paneKey: string
    let reportedWorktreeId: string | undefined
    switch (event.type) {
      case 'set':
        paneKey = event.status.paneKey
        reportedWorktreeId = event.status.worktreeId
        break
      case 'clear':
        paneKey = event.paneKey
        reportedWorktreeId = undefined
        break
      case 'migrationUnsupported':
      case 'migrationUnsupportedClear':
        return
    }
    for (const [worktreeId, snapshot] of this.mobileSessionTabsByWorktree) {
      const matchesReportedWorktree = reportedWorktreeId === worktreeId
      const matchesPane = snapshot.tabs.some(
        (tab) => tab.type === 'terminal' && this.getMobileTerminalPaneKey(tab) === paneKey
      )
      if (!matchesReportedWorktree && !matchesPane) {
        continue
      }
      this.mobileSessionTabsByWorktree.set(worktreeId, {
        ...snapshot,
        snapshotVersion: snapshot.snapshotVersion + 1
      })
      // Why: agent identity can arrive from hooks after a terminal tab is
      // published; advance the stream so paired clients receive the update.
      this.mobileSessionTabsNotifyCoalescer.schedule(worktreeId)
    }
  }
}
