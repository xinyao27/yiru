import {
  applyPRBotAuthorOverride,
  normalizePRBotAuthorOverrides
} from '@yiru/workbench-model/review'
import { normalizeAutoRenameBranchFromWorkDefaultOn } from '~shared/auto-rename-branch-from-work-settings'
import { getDefaultSettings } from '~shared/constants'
import { normalizeTerminalCursorStyleDefault } from '~shared/terminal/cursor-style-settings'
import { normalizeTerminalCustomThemes } from '~shared/terminal/custom-themes'
import {
  normalizeTuiAgentArgsRecord,
  normalizeTuiAgentEnvRecord
} from '~shared/tui-agent/launch-defaults'
import { normalizeDisabledTuiAgents } from '~shared/tui-agent/selection'
import type { GlobalSettings } from '~shared/types'
import { normalizeUiLanguage } from '~shared/ui-language'

import {
  callWebRuntimeProcedure,
  disconnectActiveWebRuntimeEnvironment,
  getWebActiveEnvironment
} from './runtime-connection'

const SETTINGS_STORAGE_KEY = 'yiru.web.settings.v1'

export function readWebSettings(): GlobalSettings {
  const environment = getWebActiveEnvironment()
  const defaults = getDefaultSettings('~')
  const rawText = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  const rawStored = readJson<Partial<GlobalSettings>>(
    SETTINGS_STORAGE_KEY,
    {}
  ) as Partial<GlobalSettings> & {
    experimentalNewWorktreeCardStyle?: unknown
    compactWorktreeCards?: unknown
    experimentalCompactWorktreeCards?: unknown
  }
  const {
    experimentalNewWorktreeCardStyle: _retiredCardStyle,
    compactWorktreeCards: _retiredCompactCards,
    experimentalCompactWorktreeCards: _retiredExperimentalCompactCards,
    ...stored
  } = rawStored
  void _retiredCardStyle
  void _retiredCompactCards
  void _retiredExperimentalCompactCards
  const hadRetiredCardSettings = [
    'experimentalNewWorktreeCardStyle',
    'compactWorktreeCards',
    'experimentalCompactWorktreeCards'
  ].some((key) => Object.prototype.hasOwnProperty.call(rawStored, key))
  const migratedStored = {
    ...stored,
    ...normalizeAutoRenameBranchFromWorkDefaultOn(stored),
    ...normalizeTerminalCursorStyleDefault(stored),
    terminalCustomThemes: normalizeTerminalCustomThemes(stored.terminalCustomThemes),
    uiLanguage: normalizeUiLanguage(stored.uiLanguage)
  }
  if (
    rawText &&
    (hadRetiredCardSettings ||
      stored.autoRenameBranchFromWork !== migratedStored.autoRenameBranchFromWork ||
      stored.autoRenameBranchFromWorkDefaultedOn !==
        migratedStored.autoRenameBranchFromWorkDefaultedOn ||
      stored.terminalCursorStyle !== migratedStored.terminalCursorStyle ||
      stored.terminalCursorStyleDefaultedToBlock !==
        migratedStored.terminalCursorStyleDefaultedToBlock ||
      stored.terminalCustomThemes !== migratedStored.terminalCustomThemes ||
      stored.uiLanguage !== migratedStored.uiLanguage)
  ) {
    try {
      const parsed = JSON.parse(rawText) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        writeSettings(migratedStored)
      }
    } catch {
      // Keep invalid persisted JSON non-destructive.
    }
  }
  return mergeSettings(
    {
      ...defaults,
      floatingTerminalEnabled: false,
      rightSidebarOpenByDefault: false,
      activeRuntimeEnvironmentId: environment?.id ?? null
    },
    migratedStored
  )
}

export async function getRuntimeBackedWebSettings(): Promise<GlobalSettings> {
  const local = readWebSettings()
  if (!getWebActiveEnvironment()) {
    return local
  }
  try {
    const result = await callWebRuntimeProcedure(
      (client, options) => client.settings.get(undefined, options),
      { timeoutMs: 15_000 }
    )
    const runtimeSettings: Partial<GlobalSettings> = {}
    if (typeof result.settings.minimaxGroupId === 'string') {
      runtimeSettings.minimaxGroupId = result.settings.minimaxGroupId
    }
    if (typeof result.settings.minimaxUsageModels === 'string') {
      runtimeSettings.minimaxUsageModels = result.settings.minimaxUsageModels
    }
    if (Array.isArray(result.settings.prBotAuthorOverrides)) {
      runtimeSettings.prBotAuthorOverrides = normalizePRBotAuthorOverrides(
        result.settings.prBotAuthorOverrides
      )
    }
    const next = mergeSettings(local, runtimeSettings)
    writeSettings(next)
    return next
  } catch {
    return local
  }
}

export async function setWebSettings(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
  if (updates.activeRuntimeEnvironmentId === null) {
    disconnectActiveWebRuntimeEnvironment()
  }
  const sanitizedUpdates = { ...updates }
  if ('autoRenameBranchFromWorkDefaultedOn' in sanitizedUpdates) {
    sanitizedUpdates.autoRenameBranchFromWorkDefaultedOn = true
  }
  const localNext = mergeSettings(readWebSettings(), sanitizedUpdates, {
    preserveAutoRenameBranchFromWorkUpdate: 'autoRenameBranchFromWork' in sanitizedUpdates
  })
  writeSettings(localNext)
  if (!getWebActiveEnvironment()) {
    return localNext
  }
  const runtimeUpdates: Partial<GlobalSettings> = {}
  if (typeof updates.minimaxGroupId === 'string') {
    runtimeUpdates.minimaxGroupId = updates.minimaxGroupId
  }
  if (typeof updates.minimaxUsageModels === 'string') {
    runtimeUpdates.minimaxUsageModels = updates.minimaxUsageModels
  }
  if (Array.isArray(updates.prBotAuthorOverrides)) {
    runtimeUpdates.prBotAuthorOverrides = normalizePRBotAuthorOverrides(
      updates.prBotAuthorOverrides
    )
  }
  if (Object.keys(runtimeUpdates).length === 0) {
    return localNext
  }
  try {
    const result = await callWebRuntimeProcedure(
      (client, options) => client.settings.update(runtimeUpdates, options),
      { timeoutMs: 15_000 }
    )
    const next = mergeSettings(localNext, result.settings)
    writeSettings(next)
    return next
  } catch {
    return localNext
  }
}

export async function updateWebPRBotAuthorOverride(args: {
  author: string
  isBot: boolean
}): Promise<GlobalSettings> {
  const local = readWebSettings()
  if (getWebActiveEnvironment()) {
    const result = await callWebRuntimeProcedure(
      (client, options) => client.settings.updatePRBotAuthorOverride(args, options),
      { timeoutMs: 15_000 }
    )
    const next = mergeSettings(local, {
      prBotAuthorOverrides: normalizePRBotAuthorOverrides(result.settings.prBotAuthorOverrides)
    })
    writeSettings(next)
    return next
  }
  const next = mergeSettings(local, {
    prBotAuthorOverrides: applyPRBotAuthorOverride(
      local.prBotAuthorOverrides,
      args.author,
      args.isBot
    )
  })
  writeSettings(next)
  return next
}

function mergeSettings(
  base: GlobalSettings,
  updates: Partial<GlobalSettings>,
  options: { preserveAutoRenameBranchFromWorkUpdate?: boolean } = {}
): GlobalSettings {
  const defaults = getDefaultSettings('~')
  const merged = {
    ...base,
    ...updates,
    notifications: { ...base.notifications, ...updates.notifications },
    disabledTuiAgents: normalizeDisabledTuiAgents(
      updates.disabledTuiAgents ?? base.disabledTuiAgents
    ),
    agentDefaultArgs: normalizeTuiAgentArgsRecord(
      updates.agentDefaultArgs ?? base.agentDefaultArgs
    ),
    agentDefaultEnv: normalizeTuiAgentEnvRecord(updates.agentDefaultEnv ?? base.agentDefaultEnv),
    voice: { ...(base.voice ?? defaults.voice), ...updates.voice } as NonNullable<
      GlobalSettings['voice']
    >,
    activeRuntimeEnvironmentId:
      getWebActiveEnvironment()?.id ?? updates.activeRuntimeEnvironmentId ?? null,
    terminalCustomThemes: normalizeTerminalCustomThemes(
      updates.terminalCustomThemes ?? base.terminalCustomThemes
    ),
    uiLanguage: normalizeUiLanguage(updates.uiLanguage ?? base.uiLanguage)
  }
  return {
    ...merged,
    ...normalizeAutoRenameBranchFromWorkDefaultOn(merged, {
      preserveExplicitValue: options.preserveAutoRenameBranchFromWorkUpdate
    })
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeSettings(value: unknown): void {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value))
}
