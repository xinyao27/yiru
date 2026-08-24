import type {
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionBrowserTab,
  RuntimeMobileSessionTabsSnapshot
} from '~shared/runtime-types'
import { parseAppSshPtyId } from '~shared/ssh-pty-id'

import { RuntimeSessionShouldPersistHeadlessMobileSessionActivation } from './should-persist-headless-mobile-session-activation'

export abstract class RuntimeSessionNotifyRendererOfHeadlessTerminalClose extends RuntimeSessionShouldPersistHeadlessMobileSessionActivation {
  protected notifyRendererOfHeadlessTerminalClose(parentTabId: string): void {
    // Why: this relay is advisory after main owns teardown; renderer failure must
    // not prevent the authoritative session flush or turn the close into failure.
    try {
      this.dispatchShellCommand({ type: 'closeTerminal', tabId: parentTabId })
    } catch (error) {
      console.warn('[runtime] failed to notify renderer after headless terminal close', {
        parentTabId,
        error
      })
    }
  }

  protected async closeHeadlessMobileBrowserTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionBrowserTab
  ): Promise<void> {
    if (tab.browserPageId) {
      await this.browserBackend?.closeTab(tab.browserPageId).catch(() => {})
    }
    const nextTabs = snapshot.tabs.filter((candidate) => candidate.id !== tab.id)
    const active = nextTabs.find((candidate) => candidate.isActive) ?? nextTabs[0] ?? null
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeTabId: active?.id ?? null,
      activeTabType: active?.type ?? null,
      tabGroups: (snapshot.tabGroups ?? []).map((group) => ({
        ...group,
        tabOrder: group.tabOrder.filter((id) => id !== tab.id),
        activeTabId: group.activeTabId === tab.id ? null : group.activeTabId
      })),
      tabs: nextTabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  protected markHeadlessBrowserSessionTabActive(
    worktreeId: string | undefined,
    browserPageId: string,
    targetGroupId?: string
  ): void {
    if (!this.browserBackend || !worktreeId) {
      return
    }
    // Hydrate first so the freshly created browser tab is present in the snapshot.
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const tab = snapshot?.tabs.find(
      (candidate): candidate is RuntimeMobileSessionBrowserTab =>
        candidate.type === 'browser' && candidate.browserPageId === browserPageId
    )
    if (!snapshot || !tab) {
      return
    }
    const groups = snapshot.tabGroups ?? []
    const hasTargetGroup =
      targetGroupId !== undefined && groups.some((group) => group.id === targetGroupId)
    // Why: move the new browser into the group whose "+" was clicked, removing it
    // from wherever the rebuild placed it. Only the TARGET group's activeTabId
    // (and the global active) change — every other group's active tab is left
    // intact, so creating in the right group never resets the left group's tab.
    const nextGroups = hasTargetGroup
      ? groups.map((group) => {
          const withoutTab = group.tabOrder.filter((id) => id !== tab.id)
          if (group.id === targetGroupId) {
            return { ...group, tabOrder: [...withoutTab, tab.id], activeTabId: tab.id }
          }
          return withoutTab.length === group.tabOrder.length
            ? group
            : { ...group, tabOrder: withoutTab }
        })
      : groups.map((group) =>
          group.tabOrder.includes(tab.id) ? { ...group, activeTabId: tab.id } : group
        )
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      ...(hasTargetGroup ? { activeGroupId: targetGroupId } : {}),
      activeTabId: tab.id,
      activeTabType: 'browser',
      tabs: snapshot.tabs.map((candidate) => ({
        ...candidate,
        isActive: candidate.id === tab.id
      })),
      tabGroups: nextGroups
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    // Why: browser group membership is otherwise live-only; persist it so a
    // later rebuild keeps the browser in its group instead of coalescing left.
    if (hasTargetGroup && nextSnapshot.tabGroupLayout) {
      this.persistHeadlessTabGroups(worktreeId, nextGroups, nextSnapshot.tabGroupLayout)
    }
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  protected closeHeadlessMobileTerminalTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): void {
    const closedParentTabId = tab.parentTabId
    const projectedPtyIds = this.removePersistedHeadlessTerminalTab(worktreeId, closedParentTabId)
    // Why: local provider ids can be reused after restart, so a dormant
    // persisted id is not kill authority. SSH relay ids remain durable exact
    // identities even before pane metadata reconnects.
    const ptyIdsToKill = new Set(projectedPtyIds.filter((ptyId) => parseAppSshPtyId(ptyId)))
    for (const candidate of snapshot.tabs) {
      if (candidate.type !== 'terminal' || candidate.parentTabId !== closedParentTabId) {
        continue
      }
      const livePty = this.findPtyForMobileTerminalTab(worktreeId, candidate)
      const candidatePtyId = livePty?.ptyId ?? candidate.ptyId
      const ptyId = candidatePtyId ? this.resolveLocalRuntimeTerminalPtyId(candidatePtyId) : null
      const hasOtherOwner = snapshot.tabs.some((other) => {
        if (other.type !== 'terminal' || other.parentTabId === closedParentTabId || !other.ptyId) {
          return false
        }
        return this.resolveLocalRuntimeTerminalPtyId(other.ptyId) === ptyId
      })
      if (ptyId && !hasOtherOwner && (livePty || parseAppSshPtyId(ptyId))) {
        // Why: a live serve leaf can exist before its debounced binding reaches
        // persistence. Include it from the authoritative snapshot so split
        // close cannot leave a provider process behind.
        ptyIdsToKill.add(ptyId)
      }
    }
    for (const ptyId of ptyIdsToKill) {
      this.ptyController?.kill(ptyId)
    }
    const nextTabs = snapshot.tabs.filter((candidate) => {
      if (candidate.type !== 'terminal' || candidate.parentTabId !== closedParentTabId) {
        return true
      }
      return false
    })
    const active = nextTabs.find((candidate) => candidate.isActive) ?? nextTabs[0] ?? null
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeTabId: active?.id ?? null,
      activeTabType: active?.type ?? null,
      tabGroups: this.buildHeadlessMobileSessionTabGroups(
        worktreeId,
        nextTabs,
        active,
        snapshot.tabGroups
      ),
      tabs: nextTabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }
}
