import type { BrowserAgentCommandResult } from '@yiru/runtime-protocol/contract'

import { BrowserError } from '../browser/cdp-bridge'
import { browserSessionRegistry } from '../browser/session-registry'
import { RuntimeBrowserCommandsLayer5 } from './runtime-browser-commands-layer-5'

export abstract class RuntimeBrowserCommandsLayer6 extends RuntimeBrowserCommandsLayer5 {
  async browserStorageLocalSet(
    params: {
      key: string
      value: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().storageLocalSet(
      params.key,
      params.value,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserStorageLocalClear(
    params: BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().storageLocalClear(
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserStorageSessionGet(
    params: { key: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().storageSessionGet(
      params.key,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserStorageSessionSet(
    params: {
      key: string
      value: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().storageSessionSet(
      params.key,
      params.value,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserStorageSessionClear(
    params: BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().storageSessionClear(
      target.worktreeId,
      target.browserPageId
    )
  }

  // ── Download command ──

  async browserDownload(
    params: {
      selector: string
      path: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().download(
      params.selector,
      params.path,
      target.worktreeId,
      target.browserPageId
    )
  }

  // ── Highlight command ──

  async browserHighlight(
    params: { selector: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().highlight(
      params.selector,
      target.worktreeId,
      target.browserPageId
    )
  }

  // ── New: exec passthrough + tab lifecycle ──

  async browserExec(
    params: { command: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().exec(
      params.command,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserTabCreate(
    params: {
      browserPageId?: string
      url?: string
      worktree?: string
      profileId?: string
      waitForRegistration?: boolean
      activate?: boolean
      targetGroupId?: string
    },
    context: { shellConnectionId?: string } = {}
  ): Promise<{ browserPageId: string }> {
    const url = params.url ?? 'about:blank'
    const worktreeId = params.worktree
      ? (await this.host.resolveWorktreeSelector(params.worktree)).id
      : undefined
    const sessionPartition = browserSessionRegistry.resolveKnownPartition(params.profileId)
    if (!sessionPartition) {
      throw new BrowserError(
        'invalid_argument',
        `Browser profile ${params.profileId} was not found`
      )
    }
    // Why: a desktop renderer mounts a <webview>; a headless serve has none and
    // backs the page with a main-process offscreen WebContents instead. Both
    // register into BrowserManager so all downstream commands resolve uniformly.
    if (!this.host.getAvailableAuthoritativeWindow()) {
      const backend = this.host.getBrowserBackend()
      if (!backend) {
        throw new BrowserError('browser_error', 'This host does not support browser panes.')
      }
      return this.createBrowserTabOffscreen(
        backend,
        url,
        worktreeId,
        params.profileId,
        params.activate,
        params.targetGroupId,
        params.browserPageId,
        context.shellConnectionId
      )
    }
    const { browserPageId } = await this.createBrowserTabInRenderer(
      url,
      worktreeId,
      params.profileId,
      params.profileId ? sessionPartition : undefined,
      params.activate
    )

    // Why: the renderer creates the Zustand tab immediately, but the webview must
    // mount and fire dom-ready before registerGuest runs. Waiting here ensures the
    // tab is operable by subsequent CLI commands (snapshot, click, etc.).
    // If registration doesn't complete within timeout, return the ID anyway — the
    // tab exists in the UI but may not be ready for automation commands yet.
    if (params.waitForRegistration !== false) {
      try {
        await this.shellAdapter?.waitForTabRegistration(browserPageId)
      } catch {
        // Tab was created in the renderer but the webview hasn't finished mounting.
        // Return success since the tab exists; subsequent commands will fail with a
        // clear "tab not available" error if the webview never loads.
      }
    }

    // Why: newly created tabs should be auto-activated so subsequent commands
    // (snapshot, click, goto) target the new tab without requiring an explicit
    // tab switch. Without this, the bridge's active tab still points at the
    // previously active tab and the new tab shows active: false in tab list.
    const bridge = this.requireAgentBrowserBridge()
    if (bridge.getRegisteredTabs(worktreeId).has(browserPageId)) {
      bridge.setActiveTab(browserPageId, worktreeId)
    }

    // Why: the renderer sets webview.src=url on mount, but agent-browser connects
    // via CDP after the webview loads about:blank. Without an explicit goto, the
    // page stays blank from agent-browser's perspective. Navigate via the bridge
    // so agent-browser's CDP session tracks the correct page state.
    if (url && url !== 'about:blank') {
      try {
        const result = await bridge.goto(url, worktreeId, browserPageId)
        this.notifyRendererNavigation(browserPageId, result.url, result.title)
      } catch {
        // Tab exists but navigation failed — caller can retry with explicit goto
      }
    }

    return { browserPageId }
  }
}
import type { BrowserCommandTargetParams } from './runtime-browser-foundation'
