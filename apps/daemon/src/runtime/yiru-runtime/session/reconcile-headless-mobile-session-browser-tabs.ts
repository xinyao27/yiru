import { parseSshPtyId } from '@yiru/runtime-protocol/terminal-identity/id'
import type {
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'

import { RuntimeSessionHydrateHeadlessMobileSessionTabsFromWorkspaceSession } from './hydrate-headless-mobile-session-tabs-from-workspace-session'

export abstract class RuntimeSessionReconcileHeadlessMobileSessionBrowserTabs extends RuntimeSessionHydrateHeadlessMobileSessionTabsFromWorkspaceSession {
  protected reconcileHeadlessMobileSessionBrowserTabs(
    worktreeId: string,
    existing: RuntimeMobileSessionTabsSnapshot
  ): void {
    const legacyBrowserIds = existing.tabs
      .filter((tab) => tab.type === 'browser')
      .map((tab) => tab.id)
    if (legacyBrowserIds.length === 0) {
      return
    }
    const nextTabs = existing.tabs.filter((tab) => tab.type !== 'browser')
    const tabGroups = (existing.tabGroups ?? []).map((group) => ({
      ...group,
      tabOrder: group.tabOrder.filter((id) => !legacyBrowserIds.includes(id))
    }))
    const activeStillPresent = nextTabs.some((tab) => tab.id === existing.activeTabId)
    const active = activeStillPresent
      ? null
      : (nextTabs.find((tab) => tab.isActive) ?? nextTabs[0] ?? null)
    this.mobileSessionTabsByWorktree.set(worktreeId, {
      ...existing,
      publicationEpoch: `legacy-browser-pruned:${Date.now().toString(36)}`,
      snapshotVersion: existing.snapshotVersion + 1,
      ...(activeStillPresent
        ? {}
        : { activeTabId: active?.id ?? null, activeTabType: active?.type ?? null }),
      tabGroups,
      tabs: nextTabs
    })
  }

  // Why: browser session tabs have no parentTabId so the terminal-only group
  // builder drops them from tabOrder; this re-adds their ids to a group.
  // Browser tabs are live-only (no persisted session entry), but their GROUP
  // membership must still survive snapshot rebuilds like terminals'. The
  // passed-in groups already encode each browser's group (carried from the prior
  // snapshot / persisted tabGroups), so keep each existing browser id where it
  // is; only a genuinely-new browser id goes to its create-target group (when
  // that group exists) and otherwise to the first group. Previously every
  // browser was force-pushed into group[0], so opening a browser in the right
  // split group always snapped it back to the left on the next rebuild.

  protected appendBrowserTabOrder(
    groups: readonly RuntimeMobileSessionTabGroup[],
    browserTabIds: readonly string[],
    newTabAssignment?: { tabId: string; groupId: string },
    // browserPageId -> groupId from the prior/persisted groups. The terminal
    // distributor rebuilds tabOrder from terminal ids only and drops browser
    // ids, so this carries each browser's group across rebuilds.
    priorGroupByBrowserId?: ReadonlyMap<string, string>
  ): RuntimeMobileSessionTabGroup[] {
    if (browserTabIds.length === 0) {
      return [...groups]
    }
    const next = groups.map((group) => ({ ...group, tabOrder: [...group.tabOrder] }))
    if (next.length === 0) {
      return next
    }
    const groupById = new Map(next.map((group) => [group.id, group]))
    const ownerGroupByTabId = new Map<string, RuntimeMobileSessionTabGroup>()
    for (const group of next) {
      for (const id of group.tabOrder) {
        ownerGroupByTabId.set(id, group)
      }
    }
    for (const id of browserTabIds) {
      if (ownerGroupByTabId.has(id)) {
        continue
      }
      const priorGroupId = priorGroupByBrowserId?.get(id)
      const targetGroup =
        (newTabAssignment?.tabId === id ? groupById.get(newTabAssignment.groupId) : undefined) ??
        (priorGroupId ? groupById.get(priorGroupId) : undefined) ??
        next[0]!
      targetGroup.tabOrder.push(id)
    }
    return next
  }

  // browserPageId -> groupId from a set of groups (the persisted/prior layout),
  // so a browser stays in its group across rebuilds that drop browser ids.

  protected collectBrowserGroupAssignment(
    groups: readonly RuntimeMobileSessionTabGroup[] | undefined,
    browserTabIds: readonly string[]
  ): Map<string, string> {
    const browserIdSet = new Set(browserTabIds)
    const assignment = new Map<string, string>()
    for (const group of groups ?? []) {
      for (const id of group.tabOrder) {
        if (browserIdSet.has(id)) {
          assignment.set(id, group.id)
        }
      }
    }
    return assignment
  }

  protected isServeOwnedPtyId(ptyId: string | null | undefined): boolean {
    return typeof ptyId === 'string' && ptyId.startsWith('serve-')
  }

  protected hasServeOwnedPtyBinding(tab: RuntimeMobileSessionTerminalTab): boolean {
    if (this.isServeOwnedPtyId(tab.ptyId)) {
      return true
    }
    return Object.values(tab.parentLayout?.ptyIdsByLeafId ?? {}).some((ptyId) =>
      this.isServeOwnedPtyId(ptyId)
    )
  }

  // Why: serve-* (local serve) and ssh:<conn>@@<relay> (SSH relay) ids are minted
  // ONLY for runtime-owned terminals and are preserved/re-hydrated, so tear them
  // down even if the renderer adopted a view (else they resurrect). The daemon
  // session form <worktreeId>@@<shortUuid> is deliberately NOT here: the daemon
  // mints it for ordinary renderer-owned local terminals too, so id shape can't
  // classify ownership for that form — renderer-graph membership does (below).

  protected isServeOrSshOwnedPtyId(ptyId: string | null | undefined): boolean {
    return (
      this.isServeOwnedPtyId(ptyId) || (typeof ptyId === 'string' && parseSshPtyId(ptyId) !== null)
    )
  }

  protected hasServeOrSshOwnedBinding(tab: RuntimeMobileSessionTerminalTab): boolean {
    if (this.isServeOrSshOwnedPtyId(tab.ptyId)) {
      return true
    }
    return Object.values(tab.parentLayout?.ptyIdsByLeafId ?? {}).some((ptyId) =>
      this.isServeOrSshOwnedPtyId(ptyId)
    )
  }

  // Why: a tab needs authoritative runtime teardown (kill + de-persist + prune)
  // only when the renderer can't durably tear it down: either it's serve/SSH
  // (preserved + re-hydrated, would resurrect) or the renderer graph never
  // published it (a leaked/unadopted shell — incl. daemon-session `@@` tabs the
  // host materialized but the renderer never showed). A tab the renderer graph
  // DOES list — including an ordinary daemon-backed local terminal or a pending
  // tab whose PTY hasn't bound — is renderer-owned: delegate, do not de-persist.

  protected isRuntimeOwnedHeadlessMobileTab(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean {
    if (this.hasServeOrSshOwnedBinding(tab)) {
      return true
    }
    const pty = this.findPtyForMobileTerminalTab(worktreeId, tab)
    if (pty && this.isServeOrSshOwnedPtyId(pty.ptyId)) {
      return true
    }
    return !this.terminalSessions.hasGraphTab(tab.parentTabId)
  }
}
