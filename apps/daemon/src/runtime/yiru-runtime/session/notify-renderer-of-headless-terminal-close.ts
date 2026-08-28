import { parseSshPtyId } from '@yiru/runtime-protocol/terminal-identity/id'
import type {
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionBrowserTab,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'

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
    const ptyIdsToKill = new Set(projectedPtyIds.filter((ptyId) => parseSshPtyId(ptyId)))
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
      if (ptyId && !hasOtherOwner && (livePty || parseSshPtyId(ptyId))) {
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
