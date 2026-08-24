import { applyPRBotAuthorOverride } from '@yiru/workbench-model/review'
import { nativeTheme } from 'electron'
import { normalizeAppIconId } from '~shared/app-icon'
import { normalizeLoaderStyle } from '~shared/loader-style'
import { normalizeProxyBypassRules, normalizeProxyUrl } from '~shared/network-proxy'
import { SETTINGS_CHANGED_WHITELIST, type SettingsChangedKey } from '~shared/telemetry-events'
import { normalizeTerminalCustomThemes } from '~shared/terminal/custom-themes'
import { normalizeTerminalLineHeight } from '~shared/terminal/line-height-settings'
import { normalizeDesktopTerminalScrollbackRows } from '~shared/terminal/scrollback-policy'
import type { GlobalSettings, PersistedState } from '~shared/types'
import { normalizeUiLanguage } from '~shared/ui-language'

import type { AgentAwakeService } from '../agent-awake-service'
import { applyAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { applyAppIcon } from '../app-icon'
import { setMainUiLanguage } from '../i18n/main-i18n'
import { rebuildAppMenu } from '../menu/register-app-menu'
import { applyElectronProxySettings } from '../network/proxy-settings'
import type { Store } from '../persistence'
import { track } from '../telemetry/client'
import { prepareLocalWorktreeRootsForRepos } from '../worktree-root-preparation'
import { scheduleCurrentWorktreeBaseDirectoryWatcherSync } from '../worktree/base-directory-watcher'
import { broadcastShellEvent } from './event-broadcast'

// Why: the whitelist is the source-of-truth for which keys we emit on. Casting
// to a Set once at module load lets the IPC handler's per-key membership
// check stay O(1) without re-coercing the readonly tuple on every call.
const SETTINGS_CHANGED_WHITELIST_SET = new Set<string>(SETTINGS_CHANGED_WHITELIST)

type LegacyTerminalScrollbackSettingsUpdate = Partial<GlobalSettings> & {
  terminalScrollbackBytes?: unknown
}

function sanitizeRendererSettingsUpdate(args: Partial<GlobalSettings>): Partial<GlobalSettings> {
  const { terminalScrollbackBytes: _legacyScrollbackBytes, ...sanitizedArgs } =
    args as LegacyTerminalScrollbackSettingsUpdate
  void _legacyScrollbackBytes
  return sanitizedArgs
}

// Why: fields that appear in the View > Appearance submenu need the menu
// rebuilt after any update so the checkbox `checked` state stays in sync
// with the persisted value. Electron doesn't reactively re-render menu
// items when the backing state changes.
const APPEARANCE_MENU_KEYS: readonly (keyof GlobalSettings)[] = ['showMobileButton']

export function initializeShellSettingsService(
  store: Store,
  agentAwakeService?: AgentAwakeService
): void {
  store.onSettingsChanged((_updates, _settings, originWebContentsId) => {
    // Why: all clients subscribe through the runtime event bus. The payload is
    // an invalidation; desktop re-reads its full shell-owned settings document.
    broadcastShellEvent({ type: 'settingsChanged' })
    void originWebContentsId
  })

  shellSettingsService = createShellSettingsService(store, agentAwakeService)
}

type ShellSettingsService = ReturnType<typeof createShellSettingsService>

let shellSettingsService: ShellSettingsService | null = null

export function getShellSettingsService(): ShellSettingsService {
  if (!shellSettingsService) {
    throw new Error('shell_settings_service_unavailable')
  }
  return shellSettingsService
}

function createShellSettingsService(store: Store, agentAwakeService?: AgentAwakeService) {
  const updatePRBotAuthorOverride = (
    args: { author: string; isBot: boolean },
    originWebContentsId: number
  ): GlobalSettings => {
    const current = store.getSettings().prBotAuthorOverrides
    const next = applyPRBotAuthorOverride(current, args.author, args.isBot)
    store.updateSettings(
      { prBotAuthorOverrides: next },
      { notifyListeners: true, originWebContentsId }
    )
    return store.getSettings()
  }

  const set = async (
    args: Partial<GlobalSettings>,
    originWebContentsId: number
  ): Promise<GlobalSettings> => {
    const sanitizedArgs = sanitizeRendererSettingsUpdate(args)
    if ('httpProxyUrl' in args) {
      const proxyUrl = normalizeProxyUrl(args.httpProxyUrl)
      sanitizedArgs.httpProxyUrl = proxyUrl.ok ? proxyUrl.value : ''
    }
    if ('httpProxyBypassRules' in args) {
      sanitizedArgs.httpProxyBypassRules = normalizeProxyBypassRules(args.httpProxyBypassRules)
    }
    if ('appIcon' in args) {
      sanitizedArgs.appIcon = normalizeAppIconId(args.appIcon)
    }
    if ('terminalCustomThemes' in args) {
      sanitizedArgs.terminalCustomThemes = normalizeTerminalCustomThemes(args.terminalCustomThemes)
    }
    if ('terminalScrollbackRows' in args) {
      sanitizedArgs.terminalScrollbackRows = normalizeDesktopTerminalScrollbackRows(
        args.terminalScrollbackRows
      )
    }
    if ('terminalLineHeight' in args) {
      sanitizedArgs.terminalLineHeight = normalizeTerminalLineHeight(args.terminalLineHeight)
    }
    if ('uiLanguage' in args) {
      sanitizedArgs.uiLanguage = normalizeUiLanguage(args.uiLanguage)
    }
    if ('loaderStyle' in args) {
      sanitizedArgs.loaderStyle = normalizeLoaderStyle(args.loaderStyle)
    }
    if (args.theme) {
      nativeTheme.themeSource = args.theme
    }
    // Why: capture the pre-update value so we only emit when the value
    // actually changes. The settings UI sometimes re-saves the same value
    // (e.g. blur after a no-op edit), and a `settings_changed` event for a
    // no-op flip would inflate the experimental-feature-adoption signal.
    const before = store.getSettings()
    const result = store.updateSettings(sanitizedArgs, {
      notifyListeners: true,
      originWebContentsId
    })
    if ('keepComputerAwakeWhileAgentsRun' in sanitizedArgs) {
      agentAwakeService?.setEnabled(result.keepComputerAwakeWhileAgentsRun)
    }
    if (
      'agentStatusHooksEnabled' in sanitizedArgs &&
      before.agentStatusHooksEnabled !== result.agentStatusHooksEnabled
    ) {
      try {
        applyAgentStatusHooksEnabled(result.agentStatusHooksEnabled)
      } catch (error) {
        console.warn('[settings] failed to apply agentStatusHooksEnabled:', error)
      }
    }
    if ('uiLanguage' in sanitizedArgs && before.uiLanguage !== result.uiLanguage) {
      setMainUiLanguage(result.uiLanguage)
      rebuildAppMenu()
    }
    if (
      ('workspaceDir' in sanitizedArgs && before.workspaceDir !== result.workspaceDir) ||
      ('nestWorkspaces' in sanitizedArgs && before.nestWorkspaces !== result.nestWorkspaces)
    ) {
      void prepareLocalWorktreeRootsForRepos(store)
      scheduleCurrentWorktreeBaseDirectoryWatcherSync()
    }
    if (APPEARANCE_MENU_KEYS.some((key) => key in sanitizedArgs)) {
      rebuildAppMenu()
    }
    if ('httpProxyUrl' in sanitizedArgs || 'httpProxyBypassRules' in sanitizedArgs) {
      try {
        await applyElectronProxySettings(result)
      } catch {
        console.warn('[settings] failed to apply network proxy settings')
      }
    }
    if ('appIcon' in sanitizedArgs && before.appIcon !== result.appIcon) {
      applyAppIcon(result.appIcon)
    }

    // Why: telemetry-plan.md§Settings — fire `settings_changed` only for
    // whitelisted keys, with `value_kind` distinguishing booleans from
    // string-enum settings. We deliberately do NOT send the raw value for
    // non-enum settings; the whitelist is currently scoped to experimental
    // toggles, all of which are booleans, so `value_kind === 'bool'` is
    // the path the v1 enum has a slot for. If a non-bool whitelisted
    // setting is ever added, extend the discriminator here at the same
    // time the schema's `value_kind` enum gains the new value.
    for (const key of Object.keys(sanitizedArgs)) {
      if (!SETTINGS_CHANGED_WHITELIST_SET.has(key)) {
        continue
      }
      const beforeValue = (before as Record<string, unknown>)[key]
      const afterValue = (result as Record<string, unknown>)[key]
      if (beforeValue === afterValue) {
        continue
      }
      if (typeof afterValue !== 'boolean') {
        // No non-bool whitelist entries today; skip rather than guess.
        continue
      }
      track('settings_changed', {
        setting_key: key as SettingsChangedKey,
        value_kind: 'bool'
      })
    }

    return result
  }

  return {
    get: (): GlobalSettings => store.getSettings(),
    set,
    updatePRBotAuthorOverride,
    getGitHubCache: (): PersistedState['githubCache'] => store.getGitHubCache(),
    setGitHubCache: (cache: PersistedState['githubCache']): void => store.setGitHubCache(cache)
  }
}
