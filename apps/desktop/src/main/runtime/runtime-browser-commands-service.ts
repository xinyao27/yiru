import type {
  BrowserProfileClearDefaultCookiesResult,
  BrowserProfileImportFromBrowserResult,
  BrowserTabListResult
} from '~shared/runtime-types'

import type { BrowserBackend } from '../browser/backend'
import { BrowserError } from '../browser/cdp-bridge'
import {
  detectInstalledBrowsers,
  importCookiesFromBrowser,
  selectBrowserProfile
} from '../browser/cookie-import'
import { importCookiesIntoHeadlessProfile } from '../browser/headless-cookie-import'
import { requireBrowserSession } from '../browser/session'
import { browserSessionRegistry } from '../browser/session-registry'
import {
  requestShellBrowserTabClose,
  requestShellBrowserTabCreate
} from './rpc/orpc/shell-services-browser-client'
import { RuntimeBrowserCommandsLayer7 } from './runtime-browser-commands-layer-7'

export class RuntimeBrowserCommands extends RuntimeBrowserCommandsLayer7 {
  async browserProfileImportFromBrowser(params: {
    profileId: string
    browserFamily: string
    browserProfile?: string
  }): Promise<BrowserProfileImportFromBrowserResult> {
    const profile = browserSessionRegistry.getProfile(params.profileId)
    if (!profile) {
      return { ok: false, reason: 'Session profile not found.' }
    }
    if (
      params.browserProfile &&
      (/[/\\]/.test(params.browserProfile) || params.browserProfile.includes('..'))
    ) {
      return { ok: false, reason: 'Invalid browser profile name.' }
    }

    const browsers = detectInstalledBrowsers()
    let browser = browsers.find((candidate) => candidate.family === params.browserFamily)
    if (!browser) {
      return { ok: false, reason: 'Browser not found on this system.' }
    }

    if (params.browserProfile && params.browserProfile !== browser.selectedProfile) {
      const reselected = selectBrowserProfile(browser, params.browserProfile)
      if (!reselected) {
        return {
          ok: false,
          reason: `No cookies database found for profile "${params.browserProfile}".`
        }
      }
      browser = reselected
    }

    const backend = this.host.getAvailableAuthoritativeWindow()
      ? null
      : this.host.getBrowserBackend()
    const result = backend
      ? await importCookiesIntoHeadlessProfile(browser, profile.id, backend)
      : await importCookiesFromBrowser(
          browser,
          profile.partition,
          requireBrowserSession(profile.partition)
        )
    if (!result.ok) {
      return result
    }

    const profileName =
      browser.profiles.find((candidate) => candidate.directory === browser.selectedProfile)?.name ??
      browser.selectedProfile
    browserSessionRegistry.updateProfileSource(params.profileId, {
      browserFamily: browser.family,
      profileName,
      importedAt: Date.now()
    })
    return { ...result, profileId: params.profileId }
  }

  async browserProfileClearDefaultCookies(): Promise<BrowserProfileClearDefaultCookiesResult> {
    const backend = this.host.getAvailableAuthoritativeWindow()
      ? null
      : this.host.getBrowserBackend()
    if (backend?.clearProfileCookies) {
      await backend.clearProfileCookies(null)
      browserSessionRegistry.clearDefaultProfileMetadata()
      return { cleared: true }
    }
    return { cleared: await browserSessionRegistry.clearDefaultSessionCookies() }
  }

  async browserTabClose(params: {
    index?: number
    page?: string
    worktree?: string
  }): Promise<{ closed: boolean }> {
    const bridge = this.requireAgentBrowserBridge()
    const pageTarget =
      typeof params.page === 'string' && params.page.length > 0
        ? await this.resolveBrowserCommandTarget({ worktree: params.worktree, page: params.page })
        : null
    const worktreeId =
      pageTarget?.worktreeId ?? (await this.resolveBrowserWorktreeId(params.worktree))

    let tabId: string | null = null
    if (typeof params.page === 'string' && params.page.length > 0) {
      if (!bridge.getRegisteredTabs(worktreeId).has(params.page)) {
        const scope = worktreeId ? ' in this worktree' : ''
        throw new BrowserError(
          'browser_tab_not_found',
          `Browser page ${params.page} was not found${scope}`
        )
      }
      tabId = params.page
    } else if (params.index !== undefined) {
      const tabs = bridge.getRegisteredTabs(worktreeId)
      const entries = [...tabs.entries()]
      if (params.index < 0 || params.index >= entries.length) {
        throw new Error(`Tab index ${params.index} out of range (0-${entries.length - 1})`)
      }
      tabId = entries[params.index][0]
    } else {
      // Why: try the bridge first (registered tabs with webviews), then fall back
      // to asking the renderer to close its active browser tab (handles cases where
      // the webview hasn't mounted yet, e.g. tab was just created).
      const tabs = bridge.getRegisteredTabs(worktreeId)
      const entries = [...tabs.entries()]
      const activeEntry = entries.find(([pageId]) => pageId === bridge.getActiveBrowserPageId())
      if (activeEntry) {
        tabId = activeEntry[0]
      }
    }

    // Why: headless serve owns its pages via the offscreen backend, with no
    // renderer to ask. Destroy the offscreen page directly when that backend is
    // the one serving this host (no renderer window).
    const backend = this.host.getAvailableAuthoritativeWindow()
      ? null
      : this.host.getBrowserBackend()
    if (backend) {
      // Why: for implicit close (no --page/--index) resolve the active page like
      // the renderer path does, so we don't report success while closing nothing.
      const resolvedTabId = tabId ?? bridge.getActivePageId(worktreeId)
      if (!resolvedTabId) {
        return { closed: false }
      }
      await backend.closeTab(resolvedTabId)
      return { closed: true }
    }

    // Why: when main cannot resolve a concrete tab id itself (for example if a
    // browser workspace exists in the renderer before its guest mounts), the
    // renderer still needs the intended worktree scope. Otherwise it falls
    // back to the globally active browser tab and can close a tab in the
    // wrong worktree.
    // Why: non-throwing getter — a missing window here (no offscreen backend
    // either, or offscreen exists but this host still somehow has no window)
    // degrades to the `renderer_unavailable` throw below instead of throwing
    // before the reverse call is even attempted.
    const winId = this.host.getAvailableAuthoritativeWindow()?.webContents.id
    const result = await requestShellBrowserTabClose(winId, { tabId, worktreeId })
    if (!result.ok) {
      throw new Error('renderer_unavailable')
    }

    return { closed: true }
  }

  protected enrichBrowserTabInfo(
    tab: BrowserTabListResult['tabs'][number]
  ): BrowserTabListResult['tabs'][number] {
    const bridge = this.requireAgentBrowserBridge()
    const rawProfileId = bridge.getSessionProfileIdForTab(tab.browserPageId)
    const profile =
      browserSessionRegistry.getProfile(rawProfileId ?? 'default') ??
      browserSessionRegistry.getDefaultProfile()
    return {
      ...tab,
      worktreeId: bridge.getWorktreeIdForTab(tab.browserPageId) ?? null,
      profileId: profile.id,
      profileLabel: profile.label
    }
  }

  protected describeBrowserTab(
    browserPageId: string,
    explicitWorktreeId?: string
  ): BrowserTabListResult['tabs'][number] {
    const bridge = this.requireAgentBrowserBridge()
    const worktreeId = explicitWorktreeId ?? bridge.getWorktreeIdForTab(browserPageId)
    const tab = bridge
      .tabList(worktreeId)
      .tabs.find((entry) => entry.browserPageId === browserPageId)
    if (!tab) {
      const scope = worktreeId ? ' in this worktree' : ''
      throw new BrowserError(
        'browser_tab_not_found',
        `Browser page ${browserPageId} was not found${scope}`
      )
    }
    return this.enrichBrowserTabInfo(tab)
  }

  // Why: headless serve path. The offscreen backend registers the page
  // synchronously, so there is no webview-mount wait. The page already loaded the
  // URL during createTab, so we only sync the bridge's active tab and notify the
  // (absent) renderer is skipped — nav state is read from the live WebContents.
  protected async createBrowserTabOffscreen(
    backend: BrowserBackend,
    url: string,
    worktreeId?: string,
    profileId?: string,
    activate?: boolean,
    targetGroupId?: string,
    requestedBrowserPageId?: string,
    shellConnectionId?: string
  ): Promise<{ browserPageId: string }> {
    const { browserPageId } = await backend.createTab({
      browserPageId: requestedBrowserPageId,
      url,
      worktreeId,
      profileId,
      shellConnectionId
    })
    const bridge = this.host.getAgentBrowserBridge()
    if (bridge?.getRegisteredTabs(worktreeId).has(browserPageId)) {
      bridge.setActiveTab(browserPageId, worktreeId)
    }
    // Why: only a user-initiated create (activate:true, e.g. the UI or a mobile
    // HTML-link tap) should steal focus by marking the tab active in the session
    // snapshot. Background/agent creates (CLI `tab create`, automation) must NOT,
    // or they'd yank a connected client/mobile to the new tab. Mirrors the
    // renderer path, which forwards `activate` and never force-focuses otherwise.
    if (activate === true) {
      this.host.markHeadlessBrowserSessionTabActive?.(worktreeId, browserPageId, targetGroupId)
    }
    return { browserPageId }
  }

  protected async createBrowserTabInRenderer(
    url: string,
    worktreeId: string | undefined,
    profileId: string | undefined,
    sessionPartition: string | undefined,
    activate?: boolean
  ): Promise<{ browserPageId: string }> {
    // Why: the caller (browserTabCreate) already confirmed a window exists —
    // this is `getAvailableAuthoritativeWindow` (not the throwing getter)
    // anyway, so an unregistered reverse link (e.g. a startup handshake race)
    // degrades to `renderer_unavailable` instead of throwing before the
    // reverse call is attempted.
    const winId = this.host.getAvailableAuthoritativeWindow()?.webContents.id
    const result = await requestShellBrowserTabCreate(winId, {
      url,
      worktreeId,
      // Why: leave sessionProfileId/sessionPartition undefined when no explicit
      // profile was chosen so the renderer still applies the user's configured
      // default-profile inheritance. Only thread the resolved partition when a
      // profile is named — sending null here would suppress inheritance and
      // force the shared default partition.
      sessionProfileId: profileId,
      sessionPartition,
      activate
    })
    if (!result.ok) {
      throw new Error('renderer_unavailable')
    }

    return { browserPageId: result.browserPageId }
  }
}
