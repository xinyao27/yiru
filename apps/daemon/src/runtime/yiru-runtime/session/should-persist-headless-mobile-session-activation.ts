import type {
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'
import { buildHeadlessTerminalSplitLayout } from '~main/runtime/headless-terminal-split-layout'
import { requestShellTerminalCloseTab } from '~main/runtime/rpc/orpc/shell-services-reverse-link'

import { RuntimeSessionActivateMobileSessionTab } from './activate-mobile-session-tab'

export abstract class RuntimeSessionShouldPersistHeadlessMobileSessionActivation extends RuntimeSessionActivateMobileSessionTab {
  protected shouldPersistHeadlessMobileSessionActivation(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean {
    if (snapshot.publicationEpoch.includes(':headless-merge:')) {
      return false
    }
    const graph = this.terminalSessions.getGraphState()
    if (graph.authoritativeWindowId !== null && graph.graphStatus === 'ready') {
      return false
    }
    return this.shouldMaterializeHeadlessMobileSessionTab(snapshot, tab)
  }

  protected activateHeadlessMobileSessionTerminalTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    activeTab: RuntimeMobileSessionTerminalTab
  ): void {
    const tabs = snapshot.tabs.map((candidate) => ({
      ...candidate,
      isActive: candidate.id === activeTab.id
    }))
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeTabId: activeTab.id,
      activeTabType: 'terminal',
      tabGroups: this.buildHeadlessMobileSessionTabGroups(
        worktreeId,
        tabs,
        activeTab,
        snapshot.tabGroups
      ),
      tabs
    }
    this.persistHeadlessTerminalActiveLeaf(worktreeId, activeTab)
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  // Why: a headless split only updated the LIVE session snapshot, never the
  // persisted workspace session layout. So a later snapshot rebuild (e.g. on the
  // next terminal create) re-derived from the stale single-leaf persisted layout
  // and collapsed the split. Persist the new split leaf into the workspace
  // session's terminalLayoutsByTabId so the split survives rebuilds.

  protected persistHeadlessTerminalSplit(args: {
    tabId: string
    leafId: string
    ptyId: string
    splitFromLeafId: string
    direction: 'horizontal' | 'vertical'
  }): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.patchWorkspaceSession) {
      return
    }
    const existing = session.terminalLayoutsByTabId?.[args.tabId]
    const nextLayout = buildHeadlessTerminalSplitLayout(
      existing ? this.cloneTerminalLayoutSnapshot(existing) : undefined,
      args
    )
    this.store.patchWorkspaceSession({
      terminalLayoutsByTabId: {
        ...session.terminalLayoutsByTabId,
        [args.tabId]: nextLayout
      }
    })
  }

  protected persistHeadlessTerminalActiveLeaf(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab
  ): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.patchWorkspaceSession) {
      return
    }
    const existingLayout = session.terminalLayoutsByTabId?.[tab.parentTabId]
    const nextLayouts = existingLayout
      ? {
          ...session.terminalLayoutsByTabId,
          [tab.parentTabId]: {
            ...this.cloneTerminalLayoutSnapshot(existingLayout),
            activeLeafId: tab.leafId
          }
        }
      : session.terminalLayoutsByTabId
    this.store.patchWorkspaceSession({
      activeTabId: tab.parentTabId,
      activeTabIdByWorktree: {
        ...session.activeTabIdByWorktree,
        [worktreeId]: tab.parentTabId
      },
      terminalLayoutsByTabId: nextLayouts
    })
  }

  async closeMobileSessionTab(worktreeSelector: string, tabId: string): Promise<{ closed: true }> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    await this.refreshMobileSessionPtyRecords()
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const tab =
      snapshot?.tabs.find((candidate) => candidate.id === tabId) ??
      snapshot?.tabs.find(
        (candidate) => candidate.type === 'terminal' && candidate.parentTabId === tabId
      ) ??
      snapshot?.tabs.find(
        (candidate) => candidate.type === 'browser' && candidate.browserWorkspaceId === tabId
      )
    if (!tab) {
      throw new Error('tab_not_found')
    }
    if (tab.type === 'terminal') {
      const parentLeafCount = snapshot!.tabs.filter(
        (candidate) => candidate.type === 'terminal' && candidate.parentTabId === tab.parentTabId
      ).length
      const closingWholeParent = tab.id !== tabId || parentLeafCount <= 1
      // Why: a runtime-owned headless tab is absent from renderer state, so the
      // closeTerminalTab relay below would ack success without killing its PTY,
      // and syncMobileSessionTabs would republish the "closed" tab. Only bypass
      // the relay when no renderer owns the parent: an adopted tab needs the
      // renderer's live pin guard and durable close transaction.
      if (closingWholeParent && !this.terminalSessions.hasGraphTab(tab.parentTabId)) {
        this.closeHeadlessMobileTerminalTab(worktreeId, snapshot!, tab)
        this.notifyRendererOfHeadlessTerminalClose(tab.parentTabId)
        this.store?.flushOrThrow?.()
        return { closed: true }
      }
      if (closingWholeParent && this.shellConnectionId) {
        // Why: whole-tab close is a lifecycle transaction. The renderer reply
        // arrives only after canonical retirement and a forced session flush.
        const result = await requestShellTerminalCloseTab(this.shellConnectionId, {
          tabId: tab.parentTabId
        })
        if (result.ok) {
          return { closed: true }
        }
      }
      // Why: an unavailable acknowledged reverse call can still leave a
      // runtime-owned parent that needs de-persist + kill.
      if (closingWholeParent && this.isRuntimeOwnedHeadlessMobileTab(worktreeId, tab)) {
        this.closeHeadlessMobileTerminalTab(worktreeId, snapshot!, tab)
        this.notifyRendererOfHeadlessTerminalClose(tab.parentTabId)
        this.store?.flushOrThrow?.()
        return { closed: true }
      }
      if (!this.shellConnectionId) {
        this.closeHeadlessMobileTerminalTab(worktreeId, snapshot!, tab)
        this.store?.flushOrThrow?.()
        return { closed: true }
      }
      if (tab.id === tabId) {
        const pty = this.findPtyForMobileTerminalTab(worktreeId, tab)
        if (pty) {
          this.ptyController?.kill(pty.ptyId)
        } else {
          this.dispatchShellCommand({ type: 'closeTerminal', tabId: tab.parentTabId })
        }
      } else {
        // Why: paired web tab bars represent a split terminal with one local
        // parent tab id. Closing that parent should close the desktop tab, not
        // just whichever leaf happened to be first in the session snapshot.
        this.dispatchShellCommand({ type: 'closeTerminal', tabId: tab.parentTabId })
      }
    } else if (tab.type === 'browser') {
      // Why: Chrome owns browser tabs now; this only removes a retained legacy
      // embedded-browser entry from the daemon session snapshot.
      await this.closeHeadlessMobileBrowserTab(worktreeId, snapshot!, tab)
    } else {
      this.dispatchShellCommand({ type: 'closeSessionTab', tabId: tab.id, worktreeId })
    }
    return { closed: true }
  }
}
