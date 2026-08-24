import type {
  BrowserAnnotationViewportInput,
  BrowserControlBooleanResult,
  BrowserDownloadCancelInput,
  BrowserGrabAwaitInput,
  BrowserGrabCaptureInput,
  BrowserGrabCaptureResult,
  BrowserGrabExtractResult,
  BrowserGrabResult,
  BrowserGrabSetModeInput,
  BrowserGrabSetModeResult,
  BrowserPageIdInput,
  BrowserPageRegisterInput,
  BrowserPageUnregisterInput,
  BrowserViewportOverrideInput
} from '@yiru/runtime-protocol/contract'
import type { RuntimeBrowserDriverState } from '~shared/runtime-types'

import type { AgentBrowserBridge } from '../browser/agent-browser-bridge'
import { BrowserError } from '../browser/cdp-bridge'
import { RuntimeBrowserCommandsContract2 } from './runtime-browser-commands-contract-2'
import type {
  ResolvedBrowserCommandTarget,
  ResolvedBrowserPage
} from './runtime-browser-foundation'

export abstract class RuntimeBrowserCommandsLayer1 extends RuntimeBrowserCommandsContract2 {
  getDrivers(): Map<string, RuntimeBrowserDriverState> {
    return this.remoteScreencasts.getDrivers()
  }

  async browserPageRegister(
    input: BrowserPageRegisterInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult> {
    return (
      (await this.shellAdapter?.browserPageRegister(input, shellConnectionId)) ?? {
        accepted: false
      }
    )
  }

  browserPageUnregister(
    input: BrowserPageUnregisterInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult {
    const result = this.shellAdapter?.browserPageUnregister(input, shellConnectionId) ?? {
      accepted: false
    }
    if (result.accepted) {
      this.navigationUpdateGenerations.delete(input.browserPageId)
    }
    return result
  }

  browserPageSetActive(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult {
    return this.shellAdapter?.browserPageSetActive(input, shellConnectionId) ?? { accepted: false }
  }

  async browserOpenDevTools(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult> {
    return (
      (await this.shellAdapter?.browserOpenDevTools(input, shellConnectionId)) ?? {
        accepted: false
      }
    )
  }

  async browserSetViewportOverride(
    input: BrowserViewportOverrideInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult> {
    return (
      (await this.shellAdapter?.browserSetViewportOverride(input, shellConnectionId)) ?? {
        accepted: false
      }
    )
  }

  async browserSetAnnotationViewport(
    input: BrowserAnnotationViewportInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult> {
    return (
      (await this.shellAdapter?.browserSetAnnotationViewport(input, shellConnectionId)) ?? {
        accepted: false
      }
    )
  }

  browserCancelDownload(
    input: BrowserDownloadCancelInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult {
    return this.shellAdapter?.browserCancelDownload(input, shellConnectionId) ?? { accepted: false }
  }

  async browserSetGrabMode(
    input: BrowserGrabSetModeInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabSetModeResult> {
    return (
      (await this.shellAdapter?.browserSetGrabMode(input, shellConnectionId)) ?? {
        ok: false,
        reason: shellConnectionId ? 'not-ready' : 'not-authorized'
      }
    )
  }

  browserAwaitGrabSelection(
    input: BrowserGrabAwaitInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabResult> {
    return (
      this.shellAdapter?.browserAwaitGrabSelection(input, shellConnectionId) ??
      Promise.resolve({
        kind: 'error',
        opId: input.opId,
        reason: shellConnectionId ? 'Guest not ready' : 'Not authorized'
      })
    )
  }

  browserCancelGrab(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult {
    return this.shellAdapter?.browserCancelGrab(input, shellConnectionId) ?? { accepted: false }
  }

  async browserCaptureSelection(
    input: BrowserGrabCaptureInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabCaptureResult> {
    return (
      (await this.shellAdapter?.browserCaptureSelection(input, shellConnectionId)) ?? {
        ok: false,
        reason: shellConnectionId ? 'Guest not ready' : 'Not authorized'
      }
    )
  }

  async browserExtractHover(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabExtractResult> {
    return (
      (await this.shellAdapter?.browserExtractHover(input, shellConnectionId)) ?? {
        ok: false,
        reason: shellConnectionId ? 'Guest not ready' : 'Not authorized'
      }
    )
  }

  reclaimForDesktop(browserPageId: string): boolean {
    return this.remoteScreencasts.reclaimForDesktop(browserPageId)
  }

  protected requireAgentBrowserBridge(): AgentBrowserBridge {
    const bridge = this.host.getAgentBrowserBridge()
    if (!bridge) {
      throw new BrowserError('browser_no_tab', 'No browser session is active')
    }
    return bridge
  }

  protected hasLiveRegisteredBrowserTab(
    bridge: AgentBrowserBridge,
    worktreeId: string | undefined
  ): boolean {
    for (const [browserPageId] of bridge.getRegisteredTabs(worktreeId)) {
      if (bridge.getPage(browserPageId)) {
        return true
      }
    }
    return false
  }

  protected hasLiveRegisteredBrowserPage(
    bridge: AgentBrowserBridge,
    worktreeId: string | undefined,
    browserPageId: string
  ): boolean {
    if (!bridge.getRegisteredTabs(worktreeId).has(browserPageId)) {
      return false
    }
    return bridge.getPage(browserPageId) !== null
  }

  // Why: the CLI sends worktree selectors (e.g. "path:/Users/...") but the
  // bridge stores worktreeIds in "repoId::path" format (from the renderer's
  // Zustand store). This helper resolves the selector to the store-compatible
  // ID so the bridge can filter tabs correctly.
  protected async resolveBrowserWorktreeId(selector?: string): Promise<string | undefined> {
    if (!selector) {
      // Why: after app restart, webviews only mount when the browser pane is visible.
      // Without --worktree, we still need to activate the view so persisted tabs
      // become operable via registerGuest.
      const bridge = this.host.getAgentBrowserBridge()
      if (bridge && !this.hasLiveRegisteredBrowserTab(bridge, undefined)) {
        try {
          await this.ensureBrowserWorktreeActive(undefined)
        } catch {
          // The window may not exist yet during startup.
        }
      }
      return undefined
    }

    const worktreeId = (await this.host.resolveWorktreeSelector(selector)).id
    // Why: explicit worktree selectors are user intent, so resolution errors
    // must surface instead of silently widening browser routing scope. Only the
    // activation step remains best-effort because missing windows during tests
    // or startup should not erase the validated worktree target itself.
    const bridge = this.host.getAgentBrowserBridge()
    if (bridge && !this.hasLiveRegisteredBrowserTab(bridge, worktreeId)) {
      try {
        await this.ensureBrowserWorktreeActive(worktreeId)
      } catch {
        // Fall through with the validated worktree id so downstream routing
        // still stays scoped to the caller's explicit selector.
      }
    }
    return worktreeId
  }

  protected async resolveBrowserCommandTarget(
    params: BrowserCommandTargetParams
  ): Promise<ResolvedBrowserCommandTarget> {
    const browserPageId =
      typeof params.page === 'string' && params.page.length > 0 ? params.page : undefined
    if (!browserPageId) {
      return {
        worktreeId: await this.resolveBrowserWorktreeId(params.worktree)
      }
    }

    const worktreeId = params.worktree
      ? (await this.host.resolveWorktreeSelector(params.worktree)).id
      : undefined
    const bridge = this.host.getAgentBrowserBridge()
    if (bridge && !this.hasLiveRegisteredBrowserPage(bridge, worktreeId, browserPageId)) {
      try {
        await this.ensureBrowserPageActive(worktreeId, browserPageId)
      } catch {
        // Fall through with the explicit page target so downstream routing
        // returns the existing clear "tab not found" error if wake fails.
      }
    }
    return {
      // Why: explicit browserPageId is already a stable tab identity, so we do
      // not auto-resolve cwd worktree scoping on top of it. Only honor an
      // explicit --worktree when the caller asked for that extra validation.
      worktreeId,
      browserPageId
    }
  }

  protected resolveBrowserPage(
    worktreeId: string | undefined,
    browserPageId: string | undefined
  ): ResolvedBrowserPage {
    const bridge = this.requireAgentBrowserBridge()
    const resolvedPageId = browserPageId ?? bridge.getActivePageId(worktreeId)
    if (!resolvedPageId) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }
    if (!bridge.getRegisteredTabs(worktreeId).has(resolvedPageId)) {
      const scope = worktreeId ? ' in this worktree' : ''
      throw new BrowserError(
        'browser_tab_not_found',
        `Browser page ${resolvedPageId} was not found${scope}`
      )
    }
    const page = bridge.getPage(resolvedPageId)
    if (!page) {
      throw new BrowserError(
        'browser_tab_not_found',
        `Browser page ${resolvedPageId} is no longer available`
      )
    }
    return { browserPageId: resolvedPageId, page }
  }
}
import type { BrowserCommandTargetParams } from './runtime-browser-foundation'
