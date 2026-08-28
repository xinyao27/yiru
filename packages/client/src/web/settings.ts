import {
  applyPRBotAuthorOverride,
  normalizePRBotAuthorOverrides
} from '@yiru/runtime-protocol/model/review'
import { normalizeAutoRenameBranchFromWorkDefaultOn } from '@yiru/runtime-protocol/workbench/auto-rename-branch-from-work-settings'
import { getDefaultSettings } from '@yiru/runtime-protocol/workbench/constants'
import { normalizeTerminalCursorStyleDefault } from '@yiru/runtime-protocol/workbench/terminal/cursor-style-settings'
import { normalizeTerminalCustomThemes } from '@yiru/runtime-protocol/workbench/terminal/custom-themes'
import {
  normalizeTuiAgentArgsRecord,
  normalizeTuiAgentEnvRecord
} from '@yiru/runtime-protocol/workbench/tui-agent/launch-defaults'
import { normalizeDisabledTuiAgents } from '@yiru/runtime-protocol/workbench/tui-agent/selection'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'
import { normalizeUiLanguage } from '@yiru/runtime-protocol/workbench/ui-language'

import {
  callWebRuntimeProcedure,
  disconnectActiveWebRuntimeEnvironment,
  getWebActiveEnvironment
} from './runtime-connection'
import { isJsonRecord, readLocalJson, writeLocalJson } from './storage/local-json'
import { decodeStoredWebSettings } from './storage/settings-codec'

const SETTINGS_STORAGE_KEY = 'yiru.web.settings.v1'

export function readWebSettings(): GlobalSettings {
  const environment = getWebActiveEnvironment()
  const defaults = getDefaultSettings('~')
  const parsed = readLocalJson(SETTINGS_STORAGE_KEY)
  const rawStored = isJsonRecord(parsed) ? parsed : {}
  const stored = decodeStoredWebSettings(defaults, rawStored)
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
    isJsonRecord(parsed) &&
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
    writeSettings(migratedStored)
  }
  return mergeSettings(
    {
      ...defaults,
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

function writeSettings(value: unknown): void {
  writeLocalJson(SETTINGS_STORAGE_KEY, value)
}
