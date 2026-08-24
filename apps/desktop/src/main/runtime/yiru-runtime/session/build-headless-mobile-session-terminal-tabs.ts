import type {
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionBrowserTab
} from '~shared/runtime-types'
import type { Tab, TerminalTab } from '~shared/types'

import { RuntimeSessionPublishPtyBackedMobileSessionTerminal } from './publish-pty-backed-mobile-session-terminal'

export abstract class RuntimeSessionBuildHeadlessMobileSessionTerminalTabs extends RuntimeSessionPublishPtyBackedMobileSessionTerminal {
  protected buildHeadlessMobileSessionTerminalTabs(
    worktreeId: string,
    persistedTabs: readonly TerminalTab[]
  ): RuntimeMobileSessionTerminalTab[] {
    const session = this.store?.getWorkspaceSession?.()
    if (!session) {
      return []
    }
    return [...persistedTabs]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .flatMap((tab, index) => {
        const layout = session.terminalLayoutsByTabId?.[tab.id]
        const leafIds = this.collectPersistedTerminalLeafIds(layout)
        if (leafIds.length === 0) {
          leafIds.push(this.deriveHeadlessLegacyTerminalLeafId(tab.id))
        }
        return leafIds.map((leafId) => {
          const ptyId =
            layout?.ptyIdsByLeafId?.[leafId] ?? (leafIds.length === 1 ? tab.ptyId : null)
          const title =
            tab.customTitle?.trim() ||
            tab.generatedTitle?.trim() ||
            tab.title?.trim() ||
            tab.defaultTitle?.trim() ||
            `Terminal ${index + 1}`
          return {
            type: 'terminal' as const,
            id: `${tab.id}::${leafId}`,
            parentTabId: tab.id,
            leafId,
            title,
            ...(ptyId ? { ptyId } : {}),
            ...(tab.startupCwd ? { startupCwd: tab.startupCwd } : {}),
            ...(tab.launchAgent ? { launchAgent: tab.launchAgent } : {}),
            ...(layout ? { parentLayout: this.cloneTerminalLayoutSnapshot(layout) } : {}),
            ...(tab.color != null ? { color: tab.color } : {}),
            ...(tab.isPinned ? { isPinned: true } : {}),
            isActive: this.isPersistedTerminalLeafActive(worktreeId, tab.id, leafId, layout)
          }
        })
      })
  }

  // Why: headless serve backs browser panes with offscreen WebContents that live
  // only in the BrowserManager, never in a renderer graph. Without surfacing them
  // as session tabs, a session.tabs snapshot (e.g. on terminal open) prunes the
  // paired browser tab and closing it fails with tab_not_found. Synthesize browser
  // session tabs from the live bridge so they are first-class alongside terminals.

  protected buildHeadlessMobileSessionBrowserTabs(
    worktreeId: string
  ): RuntimeMobileSessionBrowserTab[] {
    if (!this.browserBackend || !this.agentBrowserBridge?.tabList) {
      return []
    }
    return this.agentBrowserBridge.tabList(worktreeId).tabs.map((tab) => {
      const persistedProps = this.getPersistedUnifiedSessionTabProps(worktreeId, tab.browserPageId)
      const navigationState = this.browserBackend?.getNavigationState?.(tab.browserPageId)
      return {
        type: 'browser' as const,
        // Why: an offscreen page has no separate workspace identity, so the page id
        // is its own workspace id (matches the server's browserWorkspaceId fallback).
        id: tab.browserPageId,
        title: tab.title || tab.url || 'Browser',
        browserWorkspaceId: tab.browserPageId,
        browserPageId: tab.browserPageId,
        url: tab.url || 'about:blank',
        loading: false,
        canGoBack: navigationState?.canGoBack ?? false,
        canGoForward: navigationState?.canGoForward ?? false,
        loadError: tab.loadError ?? undefined,
        certificateFailure: tab.certificateFailure ?? undefined,
        ...(persistedProps ? { color: persistedProps.color } : {}),
        ...(persistedProps ? { isPinned: persistedProps.isPinned === true } : {}),
        isActive: tab.active === true
      }
    })
  }

  // Why: change detection for headless browser tabs. Compares the fields that
  // actually vary (a JSON.stringify equality was order-sensitive and silently
  // dropped `undefined` keys, so it only worked while both sides shared one
  // construction path).

  protected headlessBrowserTabsUnchanged(
    live: RuntimeMobileSessionBrowserTab[],
    existing: RuntimeMobileSessionBrowserTab[]
  ): boolean {
    if (live.length !== existing.length) {
      return false
    }
    return live.every((tab, index) => {
      const prev = existing[index]
      return (
        tab.id === prev.id &&
        tab.title === prev.title &&
        tab.url === prev.url &&
        tab.isActive === prev.isActive &&
        (tab.isPinned ?? false) === (prev.isPinned ?? false) &&
        tab.canGoBack === prev.canGoBack &&
        tab.canGoForward === prev.canGoForward &&
        (tab.color ?? null) === (prev.color ?? null) &&
        this.browserLoadErrorsEqual(tab.loadError, prev.loadError) &&
        this.browserCertificateFailuresEqual(tab.certificateFailure, prev.certificateFailure)
      )
    })
  }

  protected browserLoadErrorsEqual(
    a: RuntimeMobileSessionBrowserTab['loadError'],
    b: RuntimeMobileSessionBrowserTab['loadError']
  ): boolean {
    const left = a ?? null
    const right = b ?? null
    if (left === right) {
      return true
    }
    if (!left || !right) {
      return false
    }
    return (
      left.code === right.code &&
      left.description === right.description &&
      left.validatedUrl === right.validatedUrl
    )
  }

  protected browserCertificateFailuresEqual(
    a: RuntimeMobileSessionBrowserTab['certificateFailure'],
    b: RuntimeMobileSessionBrowserTab['certificateFailure']
  ): boolean {
    const left = a ?? null
    const right = b ?? null
    if (left === right) {
      return true
    }
    if (!left || !right) {
      return false
    }
    return (
      left.challengeId === right.challengeId &&
      left.browserPageId === right.browserPageId &&
      left.errorCode === right.errorCode &&
      left.error === right.error &&
      left.origin === right.origin &&
      left.displayHost === right.displayHost &&
      left.canProceed === right.canProceed &&
      left.observedAt === right.observedAt
    )
  }

  protected getPersistedUnifiedSessionTabProps(
    worktreeId: string,
    tabId: string
  ): Pick<Tab, 'color' | 'isPinned'> | null {
    const tab =
      this.store
        ?.getWorkspaceSession?.()
        ?.unifiedTabs?.[worktreeId]?.find(
          (candidate) => candidate.id === tabId || candidate.entityId === tabId
        ) ?? null
    return tab ? { color: tab.color, isPinned: tab.isPinned } : null
  }
}
