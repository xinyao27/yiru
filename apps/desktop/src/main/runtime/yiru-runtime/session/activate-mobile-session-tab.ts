import type {
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot
} from '~shared/runtime-types'
import { parseAppSshPtyId } from '~shared/ssh-pty-id'

import type { MobileSessionTerminalCommand } from '../model/terminal-launch'
import { RuntimeSessionDistributeHeadlessTabsAcrossGroups } from './distribute-headless-tabs-across-groups'

export abstract class RuntimeSessionActivateMobileSessionTab extends RuntimeSessionDistributeHeadlessTabsAcrossGroups {
  async activateMobileSessionTab(
    worktreeSelector: string,
    tabId: string,
    leafId?: string,
    opts: { notifyClients?: boolean } = {}
  ): Promise<RuntimeMobileSessionTabsResult> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    await this.refreshMobileSessionPtyRecords(worktreeId)
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const directTab = snapshot?.tabs.find((candidate) => candidate.id === tabId)
    const tab = leafId
      ? ((directTab?.type === 'terminal' && directTab.leafId === leafId ? directTab : undefined) ??
        snapshot?.tabs.find(
          (candidate) =>
            candidate.type === 'terminal' &&
            candidate.parentTabId === tabId &&
            candidate.leafId === leafId
        ))
      : (directTab ??
        snapshot?.tabs.find(
          (candidate) => candidate.type === 'terminal' && candidate.parentTabId === tabId
        ) ??
        snapshot?.tabs.find(
          (candidate) => candidate.type === 'browser' && candidate.browserWorkspaceId === tabId
        ))
    if (!tab) {
      throw new Error('tab_not_found')
    }

    if (tab.type === 'terminal') {
      const publicTab = this.toMobileSessionTabsResult(snapshot!).tabs.find(
        (candidate) => candidate.type === 'terminal' && candidate.id === tab.id
      )
      // Why: serve-created tabs can be visible before any renderer has adopted
      // their tab id, so focusing the renderer would silently no-op.
      // Phone-local activation also needs this path for inactive restored tabs:
      // desktop focus is intentionally suppressed, but the PTY still must exist.
      const shouldMaterializePendingTerminal =
        publicTab?.type === 'terminal' &&
        publicTab.status !== 'ready' &&
        (opts.notifyClients === false ||
          !this.shellConnectionId ||
          this.shouldMaterializeHeadlessMobileSessionTab(snapshot!, tab))
      if (shouldMaterializePendingTerminal) {
        const sessionId = tab.ptyId ?? tab.parentLayout?.ptyIdsByLeafId?.[tab.leafId] ?? undefined
        const targetGroupId = snapshot?.tabGroups?.find((group) =>
          group.tabOrder.includes(tab.parentTabId)
        )?.id
        // Why: a pending agent tab may exist without its startup command ever
        // having been delivered (the create's renderer stalled, #7587), so a
        // bare materialize would put a plain shell under the agent icon.
        // Re-resolve the launch like the create path; providers skip startup
        // commands when attaching to live sessions, so this cannot double-launch.
        let agentStartup: MobileSessionTerminalCommand = {}
        if (tab.launchAgent) {
          try {
            const workspace = await this.resolveTerminalWorkspaceLaunchScope(`id:${worktreeId}`)
            agentStartup = await this.resolveMobileSessionTerminalCommand(workspace, {
              agent: tab.launchAgent
            })
          } catch {
            // Why: a disabled or unresolvable agent must not make the tab
            // untappable; fall back to the plain-shell materialize.
          }
        }
        try {
          await this.createHeadlessMobileSessionTerminal(worktreeId, true, undefined, {
            identity: {
              tabId: tab.parentTabId,
              leafId: tab.leafId,
              sessionId
            },
            cwd: tab.startupCwd,
            command: agentStartup.command,
            env: agentStartup.env,
            startupCommandDelivery: agentStartup.startupCommandDelivery,
            launchConfig: agentStartup.launchConfig,
            launchAgent: tab.launchAgent,
            targetGroupId
          })
        } catch (err) {
          if (sessionId && parseAppSshPtyId(sessionId)) {
            // Why: an expired SSH reattach clears durable bindings in the store,
            // but this in-memory headless snapshot can still carry the old id.
            this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId, { force: true })
          }
          throw err
        }
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      const activeSibling =
        tab.id === tabId || leafId
          ? null
          : snapshot?.tabs.find(
              (candidate): candidate is RuntimeMobileSessionTerminalTab =>
                candidate.type === 'terminal' &&
                candidate.parentTabId === tab.parentTabId &&
                candidate.isActive
            )
      const targetTab = activeSibling ?? tab
      if (opts.notifyClients === false) {
        this.activateMobileSessionTabForRemoteClient(worktreeId, snapshot!, targetTab)
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      if (!this.shellConnectionId) {
        if (
          !targetTab.isActive &&
          this.shouldPersistHeadlessMobileSessionActivation(snapshot!, targetTab)
        ) {
          this.activateHeadlessMobileSessionTerminalTab(worktreeId, snapshot!, targetTab)
        }
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      this.dispatchShellCommand({
        type: 'focusTerminal',
        tabId: targetTab.parentTabId,
        worktreeId,
        leafId: targetTab.leafId
      })
    } else if (tab.type === 'browser') {
      if (opts.notifyClients === false) {
        this.activateMobileSessionTabForRemoteClient(worktreeId, snapshot!, tab)
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      // Why: browser mobile tabs are renderer-owned unified tabs; focusing the
      // session tab keeps desktop tab order/group state authoritative.
      this.dispatchShellCommand({ type: 'focusEditorTab', tabId: tab.id, worktreeId })
    } else {
      if (opts.notifyClients === false) {
        this.activateMobileSessionTabForRemoteClient(worktreeId, snapshot!, tab)
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      this.dispatchShellCommand({ type: 'focusEditorTab', tabId: tab.id, worktreeId })
    }
    return this.getMobileSessionTabsForWorktree(worktreeId)
  }

  protected activateMobileSessionTabForRemoteClient(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    activeTab: RuntimeMobileSessionSnapshotTab
  ): void {
    // Why: phone tab selection should update the mobile snapshot without
    // asking desktop renderers to focus the phone's background worktree.
    const activeTopLevelId = activeTab.type === 'terminal' ? activeTab.parentTabId : activeTab.id
    const tabs = snapshot.tabs.map((tab) => ({
      ...tab,
      isActive: tab.id === activeTab.id
    }))
    const tabGroups = snapshot.tabGroups?.map((group) =>
      group.tabOrder.includes(activeTopLevelId)
        ? { ...group, activeTabId: activeTopLevelId }
        : group
    )
    const activeGroupId =
      tabGroups?.find((group) => group.tabOrder.includes(activeTopLevelId))?.id ??
      snapshot.activeGroupId
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `mobile-local:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeGroupId,
      activeTabId: activeTab.id,
      activeTabType: activeTab.type,
      ...(tabGroups ? { tabGroups } : {}),
      tabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  protected shouldMaterializeHeadlessMobileSessionTab(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean {
    return (
      this.isHeadlessMobileSessionPublication(snapshot.publicationEpoch) ||
      this.hasServeOwnedPtyBinding(tab)
    )
  }
}
