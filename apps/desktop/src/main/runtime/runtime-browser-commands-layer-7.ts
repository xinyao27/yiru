import type {
  BrowserDetectProfilesResult,
  BrowserProfileCreateResult,
  BrowserProfileDeleteResult,
  BrowserProfileListResult,
  BrowserTabProfileCloneResult,
  BrowserTabProfileShowResult,
  BrowserTabSetProfileResult
} from '~shared/runtime-types'

import { BrowserError } from '../browser/cdp-bridge'
import { detectInstalledBrowsers } from '../browser/cookie-import'
import { browserSessionRegistry } from '../browser/session-registry'
import { requestShellBrowserTabSetProfile } from './rpc/orpc/shell-services-browser-client'
import { RuntimeBrowserCommandsLayer6 } from './runtime-browser-commands-layer-6'

export abstract class RuntimeBrowserCommandsLayer7 extends RuntimeBrowserCommandsLayer6 {
  async browserTabSetProfile(
    params: {
      profileId: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserTabSetProfileResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const browserPageId =
      target.browserPageId ?? this.requireAgentBrowserBridge().getActivePageId(target.worktreeId)
    if (!browserPageId) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }
    // Why: 'default' is a synthetic id; fall back to the registry's default profile when not registered.
    const profile =
      browserSessionRegistry.getProfile(params.profileId) ??
      (params.profileId === 'default' ? browserSessionRegistry.getDefaultProfile() : null)
    if (!profile) {
      throw new BrowserError(
        'invalid_argument',
        `Browser profile ${params.profileId} was not found`
      )
    }

    // Why: short-circuit no-op switches so the renderer doesn't tear down and
    // remount the webview when the tab is already on the requested profile.
    const currentProfileId =
      this.requireAgentBrowserBridge().getSessionProfileIdForTab(browserPageId) ?? 'default'
    if (currentProfileId === profile.id) {
      return {
        browserPageId,
        profileId: profile.id,
        profileLabel: profile.label
      }
    }

    const backend = this.host.getAvailableAuthoritativeWindow()
      ? null
      : this.host.getBrowserBackend()
    if (backend) {
      if (!backend.setTabProfile) {
        throw new BrowserError('browser_error', 'This host cannot change browser profiles.')
      }
      await backend.setTabProfile(browserPageId, profile.id === 'default' ? null : profile.id)
      return {
        browserPageId,
        profileId: profile.id,
        profileLabel: profile.label
      }
    }

    // Why: uses the non-throwing window getter (not `getAuthoritativeWindow`,
    // which this method called directly before this migration) — a missing
    // window degrades to `renderer_unavailable` below instead of throwing
    // before the reverse call is even attempted. There is no offscreen
    // fallback here (profile switching is a UI-only operation, unlike
    // browserTabCreate/Close below), so headless serve without a window
    // always takes this degrade path.
    const winId = this.host.getAvailableAuthoritativeWindow()?.webContents.id
    const result = await requestShellBrowserTabSetProfile(winId, {
      browserPageId,
      profileId: profile.id,
      sessionPartition: profile.partition
    })
    if (!result.ok) {
      throw new Error('renderer_unavailable')
    }

    // Why: the renderer destroys the old webview and remounts on the new
    // partition. Wait for the re-register so a follow-up tab list
    // --show-profile reads the updated sessionProfileId from BrowserManager
    // instead of stale data, and so subsequent CLI ops (snapshot, click, etc.)
    // hit a guest that's already attached.
    try {
      await this.shellAdapter?.waitForTabRegistration(browserPageId)
    } catch {
      // Best-effort: re-register won't fire if the worktree is hidden. The
      // store already reflects the new profile; downstream commands retry
      // once the pane re-mounts.
    }

    return {
      browserPageId,
      profileId: profile.id,
      profileLabel: profile.label
    }
  }

  async browserTabProfileShow(params: {
    page: string
    worktree?: string
  }): Promise<BrowserTabProfileShowResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const tab = this.describeBrowserTab(params.page, target.worktreeId)
    return {
      browserPageId: tab.browserPageId,
      worktreeId: tab.worktreeId ?? null,
      profileId: tab.profileId ?? null,
      profileLabel: tab.profileLabel ?? null
    }
  }

  async browserTabProfileClone(
    params: {
      profileId: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserTabProfileCloneResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const sourceBrowserPageId =
      target.browserPageId ?? this.requireAgentBrowserBridge().getActivePageId(target.worktreeId)
    if (!sourceBrowserPageId) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }
    const sourceTab = this.describeBrowserTab(sourceBrowserPageId, target.worktreeId)
    const profile = browserSessionRegistry.getProfile(params.profileId)
    if (!profile) {
      throw new BrowserError(
        'invalid_argument',
        `Browser profile ${params.profileId} was not found`
      )
    }
    const backend = this.host.getAvailableAuthoritativeWindow()
      ? null
      : this.host.getBrowserBackend()
    if (backend) {
      const created = await this.createBrowserTabOffscreen(
        backend,
        sourceTab.url,
        sourceTab.worktreeId ?? target.worktreeId,
        profile.id
      )
      return {
        browserPageId: created.browserPageId,
        sourceBrowserPageId,
        profileId: profile.id,
        profileLabel: profile.label
      }
    }
    const created = await this.createBrowserTabInRenderer(
      sourceTab.url,
      sourceTab.worktreeId ?? target.worktreeId,
      profile.id,
      profile.partition
    )
    // Why: parity with browserTabCreate. Wait for the cloned tab's webview to
    // register so the returned browserPageId is operable by the next CLI call.
    try {
      await this.shellAdapter?.waitForTabRegistration(created.browserPageId)
    } catch {
      // Best-effort: registration may not fire if the worktree is hidden.
    }
    return {
      browserPageId: created.browserPageId,
      sourceBrowserPageId,
      profileId: profile.id,
      profileLabel: profile.label
    }
  }

  async browserProfileList(): Promise<BrowserProfileListResult> {
    return { profiles: browserSessionRegistry.listProfiles() }
  }

  async browserProfileCreate(params: {
    label: string
    scope: 'isolated' | 'imported'
  }): Promise<BrowserProfileCreateResult> {
    const profile = browserSessionRegistry.createProfile(params.scope, params.label)
    const backend = this.host.getAvailableAuthoritativeWindow()
      ? null
      : this.host.getBrowserBackend()
    if (!profile || !backend) {
      return { profile }
    }
    if (!backend.createProfile) {
      return { profile }
    }
    try {
      await backend.createProfile(profile.id)
      return { profile }
    } catch (error) {
      await browserSessionRegistry.deleteProfile(profile.id)
      throw error
    }
  }

  async browserProfileDelete(params: { profileId: string }): Promise<BrowserProfileDeleteResult> {
    const backend = this.host.getAvailableAuthoritativeWindow()
      ? null
      : this.host.getBrowserBackend()
    const profile = browserSessionRegistry.getProfile(params.profileId)
    if (backend?.deleteProfile && profile && profile.scope !== 'default') {
      await backend.deleteProfile(profile.id)
    }
    return {
      deleted: await browserSessionRegistry.deleteProfile(params.profileId),
      profileId: params.profileId
    }
  }

  async browserProfileDetectBrowsers(): Promise<BrowserDetectProfilesResult> {
    return {
      // Why: clients only need display metadata for the picker; filesystem
      // paths and keychain identifiers stay on the runtime host.
      browsers: detectInstalledBrowsers().map((browser) => ({
        family: browser.family,
        label: browser.label,
        profiles: browser.profiles,
        selectedProfile: browser.selectedProfile
      }))
    }
  }
}
import type { BrowserCommandTargetParams } from './runtime-browser-foundation'
