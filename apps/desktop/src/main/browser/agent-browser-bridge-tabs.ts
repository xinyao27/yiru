import { AgentBrowserBridgeQueue } from './agent-browser-bridge-queue'
import type { BrowserPageHandle } from './page/handle'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeTabs extends AgentBrowserBridgeQueue {
  setActiveTab(browserPageId: string, worktreeId?: string): void {
    this.activePageId = browserPageId
    if (worktreeId) {
      this.activePagePerWorktree.set(worktreeId, browserPageId)
    }
    this.options.onTabsChanged?.(worktreeId)
  }

  protected selectFallbackActivePage(
    worktreeId: string,
    excludedBrowserPageId?: string
  ): string | null {
    for (const [browserPageId] of this.getRegisteredTabs(worktreeId)) {
      if (browserPageId === excludedBrowserPageId) {
        continue
      }
      if (this.browserPages.getPage(browserPageId)) {
        this.activePagePerWorktree.set(worktreeId, browserPageId)
        return browserPageId
      }
    }
    this.activePagePerWorktree.delete(worktreeId)
    return null
  }

  getActiveBrowserPageId(): string | null {
    return this.activePageId
  }

  getPageInfo(
    worktreeId?: string,
    browserPageId?: string
  ): { browserPageId: string; url: string; title: string } | null {
    try {
      const target = this.resolveCommandTarget(worktreeId, browserPageId)
      const page = this.browserPages.getPage(target.browserPageId)
      if (!page) {
        return null
      }
      const info = page.getInfo()
      return {
        browserPageId: target.browserPageId,
        url: info.url,
        title: info.title
      }
    } catch {
      return null
    }
  }

  onTabChanged(browserPageId: string, worktreeId?: string): void {
    this.activePageId = browserPageId
    if (worktreeId) {
      this.activePagePerWorktree.set(worktreeId, browserPageId)
    }
    this.options.onTabsChanged?.(worktreeId)
  }

  async onTabClosed(browserPageId: string): Promise<void> {
    const owningWorktreeId = this.browserPages.getWorktreeIdForTab(browserPageId)
    let nextWorktreeActivePageId: string | null = null
    if (owningWorktreeId && this.activePagePerWorktree.get(owningWorktreeId) === browserPageId) {
      nextWorktreeActivePageId = this.selectFallbackActivePage(owningWorktreeId, browserPageId)
    }
    if (this.activePageId === browserPageId) {
      this.activePageId = nextWorktreeActivePageId
    }
    const sessionName = `yiru-tab-${browserPageId}`
    await this.destroySession(sessionName)
    this.pendingInterceptRestore.delete(sessionName)
    this.options.onTabsChanged?.(owningWorktreeId)
  }

  async onProcessSwap(browserPageId: string): Promise<void> {
    // Why: the stable product page remains active while its opaque backend page
    // changes. Only the CDP session needs replacement.
    const sessionName = `yiru-tab-${browserPageId}`
    const session = this.sessions.get(sessionName)
    const owningWorktreeId = this.browserPages.getWorktreeIdForTab(browserPageId)
    // Why: save active intercept patterns before destroying so they can be restored
    // on the new session after the next successful init command.
    if (session && session.activeInterceptPatterns.length > 0) {
      this.pendingInterceptRestore.set(sessionName, [...session.activeInterceptPatterns])
    }
    await this.destroySession(sessionName)
    this.options.onTabsChanged?.(owningWorktreeId ?? undefined)
  }

  // ── Worktree-scoped tab queries ──

  getRegisteredTabs(worktreeId?: string): Map<string, string> {
    const pages = new Map<string, string>()
    for (const page of this.browserPages.getPages()) {
      const browserPageId = page.identity.browserPageId
      if (!worktreeId || this.browserPages.getWorktreeIdForTab(browserPageId) === worktreeId) {
        pages.set(browserPageId, page.identity.backendPageId)
      }
    }
    return pages
  }

  getPage(browserPageId: string): BrowserPageHandle | null {
    return this.browserPages.getPage(browserPageId)
  }

  getWorktreeIdForTab(browserPageId: string): string | undefined {
    return this.browserPages.getWorktreeIdForTab(browserPageId)
  }

  getSessionProfileIdForTab(browserPageId: string): string | null {
    return this.browserPages.getSessionProfileIdForTab(browserPageId)
  }

  async destroyAll(): Promise<void> {
    const sessionNames = new Set([
      ...this.sessions.keys(),
      ...this.pendingSessionCreation.keys(),
      ...this.pendingSessionDestruction.keys()
    ])
    await Promise.allSettled(
      [...sessionNames].map((sessionName) => this.destroySession(sessionName))
    )
    this.activePageId = null
    this.activePagePerWorktree.clear()
    this.pendingInterceptRestore.clear()
  }

  // ── Tab management ──
}
