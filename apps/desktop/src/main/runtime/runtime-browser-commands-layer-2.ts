import type {
  BrowserBackResult,
  BrowserClickResult,
  BrowserFillResult,
  BrowserGotoResult,
  BrowserReloadResult,
  BrowserScreenshotResult,
  BrowserScreencastResult,
  BrowserScrollResult,
  BrowserSelectResult,
  BrowserSnapshotResult,
  BrowserTypeResult
} from '~shared/runtime-types'

import { publishShellEvent } from '../shell/events'
import { RuntimeBrowserCommandsLayer1 } from './runtime-browser-commands-layer-1'
import type { BrowserScreencastParams } from './runtime-browser-foundation'
import { BROWSER_NAVIGATION_STATE_REPUBLISH_DELAY_MS } from './runtime-browser-foundation'

export abstract class RuntimeBrowserCommandsLayer2 extends RuntimeBrowserCommandsLayer1 {
  // Why: browser tabs must become paintable before their webview guest starts
  // and registerGuest fires, but automation must not steal the user's visible
  // worktree/browser pane. Ask the renderer to background-mount the worktree and
  // acquire a hidden automation visibility lease instead of activating the UI.
  protected async ensureBrowserWorktreeActive(worktreeId: string | undefined): Promise<void> {
    if (!this.shellAdapter) {
      return
    }
    const win = this.host.getAuthoritativeWindow()
    publishShellEvent(win.webContents.id, {
      type: 'browserActivateView',
      ...(worktreeId ? { worktreeId } : {})
    })
    // Why: hidden/restored browser panes become operable only after the
    // renderer's webview mounts and calls registerGuest. Waiting on that IPC is
    // both faster and less flaky than sleeping for an arbitrary fixed delay.
    await this.shellAdapter.waitForWorktreeTabRegistration(worktreeId)
  }

  protected async ensureBrowserPageActive(
    worktreeId: string | undefined,
    browserPageId: string
  ): Promise<void> {
    if (!this.shellAdapter) {
      return
    }
    const win = this.host.getAuthoritativeWindow()
    publishShellEvent(win.webContents.id, {
      type: 'browserActivateView',
      ...(worktreeId ? { worktreeId } : {}),
      browserPageId
    })
    await this.shellAdapter.waitForTabRegistration(browserPageId)
  }

  // Why: agent-browser drives navigation via CDP, which bypasses Electron's
  // webview event system. The renderer's did-navigate / page-title-updated
  // listeners never fire, leaving the Zustand store (and thus the Yiru UI's
  // address bar and tab title) stale. Push updates from main → renderer after
  // any navigation-causing command so the UI stays in sync.
  protected notifyRendererNavigation(browserPageId: string, url: string, title: string): void {
    const generation = (this.navigationUpdateGenerations.get(browserPageId) ?? 0) + 1
    this.navigationUpdateGenerations.set(browserPageId, generation)
    const publish = (readLiveInfo: boolean): void => {
      const page = this.host.getAgentBrowserBridge()?.getPage(browserPageId)
      const info = readLiveInfo ? page?.getInfo() : undefined
      const navigationState = page?.getNavigationState?.()
      this.host.emitBrowserGuestEvent({
        type: 'navigationUpdate',
        browserPageId,
        url: info?.url || url,
        title: info?.title || title,
        ...navigationState
      })
    }

    publish(false)
    // Why: Chromium can settle navigationHistory just after the CDP command
    // response. A trailing read prevents a stale Forward/Back affordance from
    // winning the renderer-to-mobile session snapshot race.
    setTimeout(() => {
      // Why: a rapid Back → Forward (or repeated reload) can queue multiple delayed
      // reads. Only the newest navigation may publish the settled history state.
      if (this.navigationUpdateGenerations.get(browserPageId) !== generation) {
        return
      }
      publish(true)
    }, BROWSER_NAVIGATION_STATE_REPUBLISH_DELAY_MS)
  }

  // Why: `tabSwitch` only flips the bridge's `activeWebContentsId` — it
  // does not surface the browser pane in the renderer. Without --focus, the
  // switch is invisible to the user. With --focus, we send a dedicated IPC
  // so the renderer can update its per-worktree active-tab state.
  //
  // Why this IPC carries `worktreeId` instead of letting the renderer
  // dispatch `setActiveWorktree`: multiple agents drive browsers in parallel
  // worktrees. A global focus call from agent X would steal the user's
  // screen from agent Y's worktree. The renderer-side handler
  // (focusBrowserTabInWorktree) updates per-worktree state unconditionally
  // and only flips globals when the user is already on the targeted
  // worktree. Cross-worktree --focus calls pre-stage silently.
  protected notifyRendererBrowserPaneFocus(
    worktreeId: string | undefined,
    browserPageId: string
  ): void {
    try {
      const win = this.host.getAuthoritativeWindow()
      publishShellEvent(win.webContents.id, {
        type: 'browserPaneFocus',
        worktreeId: worktreeId ?? null,
        browserPageId
      })
    } catch {
      // Window may not exist during shutdown
    }
  }

  async browserSnapshot(params: BrowserCommandTargetParams): Promise<BrowserSnapshotResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().snapshot(target.worktreeId, target.browserPageId)
  }

  async browserClick(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserClickResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const bridge = this.requireAgentBrowserBridge()
    const result = await bridge.click(params.element, target.worktreeId, target.browserPageId)
    // Why: clicks can trigger navigation (e.g. submitting a form, clicking a link).
    // Read the target tab's live URL/title after the click and push to the
    // renderer so the UI updates even when automation targeted a non-active page.
    const page = bridge.getPageInfo(target.worktreeId, target.browserPageId)
    if (page) {
      this.notifyRendererNavigation(page.browserPageId, page.url, page.title)
    }
    return result
  }

  async browserGoto(
    params: { url: string } & BrowserCommandTargetParams
  ): Promise<BrowserGotoResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const bridge = this.requireAgentBrowserBridge()
    const result = await bridge.goto(params.url, target.worktreeId, target.browserPageId)
    const pageId = bridge.getActivePageId(target.worktreeId, target.browserPageId)
    if (pageId) {
      this.notifyRendererNavigation(pageId, result.url, result.title)
    }
    return result
  }

  async browserFill(
    params: {
      element: string
      value: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserFillResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().fill(
      params.element,
      params.value,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserType(
    params: { input: string } & BrowserCommandTargetParams
  ): Promise<BrowserTypeResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().type(
      params.input,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserSelect(
    params: {
      element: string
      value: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserSelectResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().select(
      params.element,
      params.value,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserScroll(
    params: { direction: 'up' | 'down'; amount?: number } & BrowserCommandTargetParams
  ): Promise<BrowserScrollResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().scroll(
      params.direction,
      params.amount,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserBack(params: BrowserCommandTargetParams): Promise<BrowserBackResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const bridge = this.requireAgentBrowserBridge()
    const result = await bridge.back(target.worktreeId, target.browserPageId)
    const pageId = bridge.getActivePageId(target.worktreeId, target.browserPageId)
    if (pageId) {
      this.notifyRendererNavigation(pageId, result.url, result.title)
    }
    return result
  }

  async browserReload(params: BrowserCommandTargetParams): Promise<BrowserReloadResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const bridge = this.requireAgentBrowserBridge()
    const result = await bridge.reload(target.worktreeId, target.browserPageId)
    const pageId = bridge.getActivePageId(target.worktreeId, target.browserPageId)
    if (pageId) {
      this.notifyRendererNavigation(pageId, result.url, result.title)
    }
    return result
  }

  async browserScreenshot(
    params: {
      format?: 'png' | 'jpeg'
    } & BrowserCommandTargetParams
  ): Promise<BrowserScreenshotResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().screenshot(
      params.format,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserScreencast(
    params: BrowserScreencastParams,
    options: {
      connectionId?: string
      sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
      signal?: AbortSignal
      emit: (result: BrowserScreencastResult) => void
    }
  ): Promise<void> {
    return await this.remoteScreencasts.screencast(params, options)
  }
}
import type { BrowserCommandTargetParams } from './runtime-browser-foundation'
