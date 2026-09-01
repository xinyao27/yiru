import { normalizeRuntimePathForComparison } from '@yiru/runtime-protocol/model/platform'
import { normalizePRBotAuthorOverrides } from '@yiru/runtime-protocol/model/review'
import { normalizeTerminalShortcutPolicy } from '@yiru/runtime-protocol/workbench/keybindings'
import { normalizeLoaderStyle } from '@yiru/runtime-protocol/workbench/loader-style'
import { normalizeOpenInApplications } from '@yiru/runtime-protocol/workbench/open-in-applications'
import {
  mergeLegacyCommitMessageAiIntoSourceControlAi,
  normalizeSourceControlAiSettings,
  projectSourceControlAiToLegacyCommitMessageAi
} from '@yiru/runtime-protocol/workbench/source-control/ai'
import {
  DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES,
  SOURCE_CONTROL_TEXT_ACTION_IDS
} from '@yiru/runtime-protocol/workbench/source-control/ai-actions'
import { normalizeSourceControlGroupOrder } from '@yiru/runtime-protocol/workbench/source-control/group-order'
import { normalizeTerminalCustomThemes } from '@yiru/runtime-protocol/workbench/terminal/custom-themes'
import { normalizeTerminalQuickCommands } from '@yiru/runtime-protocol/workbench/terminal/quick-commands'
import { normalizeDesktopTerminalScrollbackRows } from '@yiru/runtime-protocol/workbench/terminal/scrollback-policy'
import {
  normalizeTuiAgentArgsRecord,
  normalizeTuiAgentEnvRecord
} from '@yiru/runtime-protocol/workbench/tui-agent/launch-defaults'
import { normalizeDisabledTuiAgents } from '@yiru/runtime-protocol/workbench/tui-agent/selection'
import type { GlobalSettings, YiruWorkspaceLayout } from '@yiru/runtime-protocol/workbench/types'
import { normalizeUiLanguage } from '@yiru/runtime-protocol/workbench/ui-language'

import { normalizePersistedNotificationSettings } from './persisted-notification-settings-codec'
import { stripRetiredGlobalSettings } from './persisted-settings-codec'

export type PersistedSettingsMutation = {
  settings: GlobalSettings
  changedUpdates: Partial<GlobalSettings>
}

function layoutKey(layout: YiruWorkspaceLayout): string {
  return `${normalizeRuntimePathForComparison(layout.path)}:${layout.nestWorkspaces}`
}

function buildWorkspaceDirHistory(
  current: GlobalSettings,
  updates: Partial<GlobalSettings>
): YiruWorkspaceLayout[] | null {
  if (!('workspaceDir' in updates) && !('nestWorkspaces' in updates)) {
    return null
  }
  const nextPath = updates.workspaceDir ?? current.workspaceDir
  const nextNestWorkspaces = updates.nestWorkspaces ?? current.nestWorkspaces
  if (
    normalizeRuntimePathForComparison(nextPath) ===
      normalizeRuntimePathForComparison(current.workspaceDir) &&
    nextNestWorkspaces === current.nestWorkspaces
  ) {
    return null
  }
  const previous = { path: current.workspaceDir, nestWorkspaces: current.nestWorkspaces }
  const next = [...(current.workspaceDirHistory ?? [])]
  if (!next.some((layout) => layoutKey(layout) === layoutKey(previous))) {
    next.push(previous)
  }
  return next
}

function retireClearedTextActionInstructions(
  sourceControlAi: GlobalSettings['sourceControlAi'],
  previousSettings: GlobalSettings
): GlobalSettings['sourceControlAi'] {
  if (!sourceControlAi?.actions) {
    return sourceControlAi
  }
  const previous = normalizeSourceControlAiSettings(
    previousSettings.sourceControlAi,
    previousSettings.commitMessageAi
  )
  let instructions = sourceControlAi.instructionsByOperation
  let changed = false
  for (const actionId of SOURCE_CONTROL_TEXT_ACTION_IDS) {
    if (
      sourceControlAi.actions[actionId]?.commandInputTemplate !==
        DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES[actionId] ||
      previous.actions?.[actionId]?.commandInputTemplate ===
        DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES[actionId] ||
      instructions?.[actionId] !== previous.instructionsByOperation[actionId] ||
      instructions?.[actionId] === ''
    ) {
      continue
    }
    // Why: an empty instruction is the rollback-compatible explicit clear state.
    instructions = { ...instructions, [actionId]: '' }
    changed = true
  }
  return changed ? { ...sourceControlAi, instructionsByOperation: instructions } : sourceControlAi
}

function normalizeSettingsUpdate(
  current: GlobalSettings,
  updates: Partial<GlobalSettings>
): Partial<GlobalSettings> {
  const normalized = stripRetiredGlobalSettings(updates)
  if ('showPinnedWorktreesInGroups' in updates) {
    normalized.showPinnedWorktreesInGroups = updates.showPinnedWorktreesInGroups === true
  }
  if ('disabledTuiAgents' in updates) {
    normalized.disabledTuiAgents = normalizeDisabledTuiAgents(updates.disabledTuiAgents)
  }
  if ('agentDefaultArgs' in updates) {
    normalized.agentDefaultArgs = normalizeTuiAgentArgsRecord(updates.agentDefaultArgs)
    normalized.agentYoloDefaultsMigrated = true
  }
  if ('agentDefaultEnv' in updates) {
    normalized.agentDefaultEnv = normalizeTuiAgentEnvRecord(updates.agentDefaultEnv)
    normalized.agentYoloDefaultsMigrated = true
  }
  if ('terminalQuickCommands' in updates) {
    normalized.terminalQuickCommands = normalizeTerminalQuickCommands(updates.terminalQuickCommands)
  }
  if ('terminalCustomThemes' in updates) {
    normalized.terminalCustomThemes = normalizeTerminalCustomThemes(updates.terminalCustomThemes)
  }
  if ('terminalScrollbackRows' in updates) {
    normalized.terminalScrollbackRows = normalizeDesktopTerminalScrollbackRows(
      updates.terminalScrollbackRows
    )
  }
  if (
    'terminalTuiScrollSensitivity' in updates ||
    'terminalTuiScrollSensitivityDefaultedToOne' in updates
  ) {
    normalized.terminalTuiScrollSensitivityDefaultedToOne = true
  }
  if ('autoRenameBranchFromWork' in updates || 'autoRenameBranchFromWorkDefaultedOn' in updates) {
    normalized.autoRenameBranchFromWorkDefaultedOn = true
  }
  if ('openInApplications' in updates) {
    normalized.openInApplications = normalizeOpenInApplications(updates.openInApplications)
  }
  if ('terminalShortcutPolicy' in updates) {
    normalized.terminalShortcutPolicy = normalizeTerminalShortcutPolicy(
      updates.terminalShortcutPolicy
    )
  }
  if ('sourceControlGroupOrder' in updates) {
    normalized.sourceControlGroupOrder = normalizeSourceControlGroupOrder(
      updates.sourceControlGroupOrder
    )
  }
  if ('loaderStyle' in updates) {
    normalized.loaderStyle = normalizeLoaderStyle(updates.loaderStyle)
  }
  if ('uiLanguage' in updates) {
    normalized.uiLanguage = normalizeUiLanguage(updates.uiLanguage)
  }
  if ('prBotAuthorOverrides' in updates) {
    normalized.prBotAuthorOverrides = normalizePRBotAuthorOverrides(updates.prBotAuthorOverrides)
  }
  const history = buildWorkspaceDirHistory(current, normalized)
  if (history) {
    normalized.workspaceDirHistory = history
  }
  if ('sourceControlAi' in normalized) {
    normalized.sourceControlAi = retireClearedTextActionInstructions(
      normalized.sourceControlAi,
      current
    )
    const sourceControlAi = normalizeSourceControlAiSettings(
      normalized.sourceControlAi,
      current.commitMessageAi
    )
    normalized.sourceControlAi = sourceControlAi
    normalized.commitMessageAi = projectSourceControlAiToLegacyCommitMessageAi(
      sourceControlAi,
      current.commitMessageAi
    )
  } else if ('commitMessageAi' in normalized) {
    normalized.sourceControlAi = mergeLegacyCommitMessageAiIntoSourceControlAi(
      current.sourceControlAi,
      normalized.commitMessageAi
    )
  }
  return normalized
}

export function applyPersistedSettingsUpdate(
  current: GlobalSettings,
  updates: Partial<GlobalSettings>
): PersistedSettingsMutation {
  const normalized = normalizeSettingsUpdate(current, updates)
  const telemetry =
    normalized.telemetry !== undefined
      ? { ...current.telemetry, ...normalized.telemetry }
      : current.telemetry
  const settings: GlobalSettings = {
    ...current,
    ...normalized,
    notifications: normalizePersistedNotificationSettings({
      ...current.notifications,
      ...normalized.notifications
    }),
    ...(telemetry !== undefined ? { telemetry } : {})
  }
  const changedUpdates = {} as Partial<GlobalSettings> & Record<string, unknown>
  for (const key of Object.keys(normalized) as (keyof GlobalSettings)[]) {
    if (!Object.is(current[key], settings[key])) {
      changedUpdates[String(key)] = settings[key]
    }
  }
  return { settings, changedUpdates }
}
