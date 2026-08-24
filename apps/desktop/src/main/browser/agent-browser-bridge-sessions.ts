import { AgentBrowserBridgeFoundation } from './agent-browser-bridge-foundation'
import type { ResolvedBrowserCommandTarget } from './agent-browser-bridge-input'
import { BrowserError } from './cdp-bridge'
import { CdpWsProxy } from './cdp-ws-proxy'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeSessions extends AgentBrowserBridgeFoundation {
  getActivePageId(worktreeId?: string, browserPageId?: string): string | null {
    try {
      return this.resolveCommandTarget(worktreeId, browserPageId).browserPageId
    } catch {
      return null
    }
  }

  protected resolveCommandTarget(
    worktreeId?: string,
    browserPageId?: string,
    requireScopedTarget = false
  ): ResolvedBrowserCommandTarget {
    if (!browserPageId) {
      return requireScopedTarget
        ? this.resolveScopedActiveTab(worktreeId)
        : this.resolveActiveTab(worktreeId)
    }

    const tabs = this.getRegisteredTabs(worktreeId)
    const backendPageId = tabs.get(browserPageId)
    if (backendPageId == null) {
      const scope = worktreeId ? ' in this worktree' : ''
      throw new BrowserError(
        'browser_tab_not_found',
        `Browser page ${browserPageId} was not found${scope}`
      )
    }

    const page = this.browserPages.getPage(browserPageId)
    if (!page || page.identity.backendPageId !== backendPageId) {
      this.browserPages.unregisterPage(browserPageId)
      throw new BrowserError(
        'browser_tab_not_found',
        `Browser page ${browserPageId} is no longer available`
      )
    }

    return { browserPageId, backendPageId }
  }

  protected resolveActiveTab(worktreeId?: string): ResolvedBrowserCommandTarget {
    const tabs = this.getRegisteredTabs(worktreeId)

    if (tabs.size === 0) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }

    // Why: prefer per-worktree active page to prevent cross-worktree interference.
    // Fall back to the global stable page identity for unscoped callers.
    const preferredPageId =
      (worktreeId && this.activePagePerWorktree.get(worktreeId)) ?? this.activePageId

    if (preferredPageId != null) {
      const backendPageId = tabs.get(preferredPageId)
      const page = this.browserPages.getPage(preferredPageId)
      if (backendPageId && page?.identity.backendPageId === backendPageId) {
        return { browserPageId: preferredPageId, backendPageId }
      }
      if (backendPageId) {
        this.browserPages.unregisterPage(preferredPageId)
        if (this.activePageId === preferredPageId) {
          this.activePageId = null
        }
        if (worktreeId && this.activePagePerWorktree.get(worktreeId) === preferredPageId) {
          this.activePagePerWorktree.delete(worktreeId)
        }
      }
    }

    // Why: persisted store state can leave ghost tabs whose webContents no longer exist.
    // Skip those and pick the first live tab. Also activate it so tabList and
    // subsequent resolveActiveTab calls are consistent without requiring an
    // explicit tab switch after app startup.
    for (const [tabId, backendPageId] of tabs) {
      const page = this.browserPages.getPage(tabId)
      if (page?.identity.backendPageId === backendPageId) {
        this.activePageId = tabId
        if (worktreeId) {
          this.activePagePerWorktree.set(worktreeId, tabId)
        }
        return { browserPageId: tabId, backendPageId }
      }
      this.browserPages.unregisterPage(tabId)
    }

    throw new BrowserError(
      'browser_no_tab',
      'No live browser tab available — all registered tabs have been destroyed'
    )
  }

  // Why: text-mutating commands (inserttext/type/fill) must not silently fall
  // back to the global active tab when no worktree was resolved — that tab can
  // belong to a worktree the user is currently viewing, so a goal-loop agent in
  // another worktree would inject text into the user's foreground webview and
  // steal OS focus. A scoped (worktreeId-bearing) call is already safe because
  // the candidate set is pre-filtered to that worktree, so defer to the lenient
  // resolver. An unscoped call instead requires an unambiguous target: scope to
  // the lone worktree with live tabs, or refuse rather than guess.
  protected resolveScopedActiveTab(worktreeId?: string): ResolvedBrowserCommandTarget {
    if (worktreeId) {
      return this.resolveActiveTab(worktreeId)
    }

    const worktreesWithLiveTabs = new Set<string | undefined>()
    for (const [tabId, backendPageId] of this.getRegisteredTabs(undefined)) {
      if (this.browserPages.getPage(tabId)?.identity.backendPageId === backendPageId) {
        worktreesWithLiveTabs.add(this.browserPages.getWorktreeIdForTab(tabId))
      }
    }

    if (worktreesWithLiveTabs.size === 0) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }
    if (worktreesWithLiveTabs.size > 1) {
      throw new BrowserError(
        'browser_target_ambiguous',
        'Multiple worktrees have browser tabs open; pass --worktree to target text insertion safely'
      )
    }

    const [onlyWorktreeId] = worktreesWithLiveTabs
    return this.resolveActiveTab(onlyWorktreeId)
  }

  protected async ensureSession(
    sessionName: string,
    browserPageId: string,
    backendPageId: string
  ): Promise<void> {
    const pendingDestruction = this.pendingSessionDestruction.get(sessionName)
    if (pendingDestruction) {
      await pendingDestruction
    }

    const existingSession = this.sessions.get(sessionName)
    if (existingSession) {
      if (existingSession.backendPageId === backendPageId) {
        return
      }
      await this.restartSessionForTarget(sessionName, browserPageId, backendPageId)
      return
    }

    // Why: two concurrent CLI calls can both reach here before either finishes
    // creating the session. Without this lock, both would create proxies and the
    // second would overwrite the first, leaking the first proxy's server/debugger.
    const pending = this.pendingSessionCreation.get(sessionName)
    if (pending) {
      await pending
      return
    }

    const createSession = async (): Promise<void> => {
      const page = this.browserPages.getPage(browserPageId)
      if (!page || page.identity.backendPageId !== backendPageId) {
        // Why: the renderer can unregister/destroy a webview between target
        // resolution and session creation. Preserve the explicit page identity
        // so callers get the same error shape as a settled closed tab.
        throw new BrowserError(
          'browser_tab_not_found',
          `Browser page ${browserPageId} is no longer available`
        )
      }

      // Why: agent-browser's daemon persists session state (including the CDP port)
      // across Yiru restarts. A stale session ignores --cdp (already initialized) and
      // connects to the dead port. Must await close so the daemon forgets the session
      // before we pass --cdp with the new port.
      await this.closeStaleAgentBrowserSession(sessionName)

      const proxy = new CdpWsProxy(page)
      const cdpEndpoint = await proxy.start()

      this.sessions.set(sessionName, {
        proxy,
        cdpEndpoint,
        initialized: false,
        consecutiveTimeouts: 0,
        activeInterceptPatterns: [],
        activeCapture: false,
        backendPageId,
        browserPageId,
        activeProcess: null
      })
    }

    const promise = createSession()
    this.pendingSessionCreation.set(sessionName, promise)
    try {
      await promise
    } finally {
      this.pendingSessionCreation.delete(sessionName)
    }
  }

  protected async restartSessionForTarget(
    sessionName: string,
    browserPageId: string,
    backendPageId: string,
    options: { recreate: boolean } = { recreate: true }
  ): Promise<void> {
    const pendingCreation = this.pendingSessionCreation.get(sessionName)
    if (pendingCreation) {
      await pendingCreation.catch(() => {})
    }

    const session = this.sessions.get(sessionName)
    if (session) {
      if (session.activeInterceptPatterns.length > 0) {
        this.pendingInterceptRestore.set(sessionName, [...session.activeInterceptPatterns])
      }
      this.sessions.delete(sessionName)
      this.pendingSessionCreation.delete(sessionName)
      if (session.activeProcess) {
        this.cancelledProcesses.add(session.activeProcess)
        try {
          session.activeProcess.kill()
        } catch {
          // Process may already be exiting.
        }
        session.activeProcess = null
      }

      const destroy = (async (): Promise<void> => {
        try {
          await this.runAgentBrowserRaw(sessionName, ['--session', sessionName, 'close'])
        } catch {
          // Session may already be dead.
        }
        await session.proxy.stop()
      })()
      this.pendingSessionDestruction.set(sessionName, destroy)
      try {
        await destroy
      } finally {
        this.pendingSessionDestruction.delete(sessionName)
      }
    }

    if (options.recreate) {
      await this.ensureSession(sessionName, browserPageId, backendPageId)
    }
  }

  protected async destroySession(sessionName: string): Promise<void> {
    const pendingDestruction = this.pendingSessionDestruction.get(sessionName)
    if (pendingDestruction) {
      await pendingDestruction
      return
    }

    const pendingCreation = this.pendingSessionCreation.get(sessionName)
    if (pendingCreation) {
      // Why: tab close can race with stale-session cleanup before sessions.set().
      // Wait for creation to settle so a late proxy cannot survive the close.
      try {
        await pendingCreation
      } catch {
        // Creation failures are handled by the original caller; teardown still
        // needs to reject queued work and clear any partial state below.
      }
    }

    const session = this.sessions.get(sessionName)
    if (!session) {
      this.rejectQueuedCommandsForClosedSession(sessionName)
      return
    }

    this.sessions.delete(sessionName)
    this.pendingSessionCreation.delete(sessionName)

    // Why: queued commands would hang forever if we just delete the queue —
    // their promises would never resolve or reject. Drain and reject them.
    this.rejectQueuedCommandsForClosedSession(sessionName)

    if (session.activeProcess) {
      // Why: queued command rejection is not enough when a daemon command is
      // already running. Kill the active process so callers do not wait for the
      // generic exec timeout after the session/tab has already been destroyed.
      this.cancelledProcesses.add(session.activeProcess)
      try {
        session.activeProcess.kill()
      } catch {
        // Process may already be exiting.
      }
      session.activeProcess = null
    }

    const destroy = (async (): Promise<void> => {
      try {
        // Why: each browser tab uses its own named agent-browser session. Closing
        // without --session only tears down the default session and leaves the tab
        // session's daemon process running.
        await this.runAgentBrowserRaw(sessionName, ['--session', sessionName, 'close'])
      } catch {
        // Session may already be dead
      }

      await session.proxy.stop()
    })()
    this.pendingSessionDestruction.set(sessionName, destroy)
    try {
      await destroy
    } finally {
      this.pendingSessionDestruction.delete(sessionName)
    }
  }
}
