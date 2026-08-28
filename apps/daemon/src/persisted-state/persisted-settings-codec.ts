import { normalizePRBotAuthorOverrides } from '@yiru/runtime-protocol/model/review'
import { normalizeAppIconId } from '@yiru/runtime-protocol/workbench/app-icon'
import { normalizeAutoRenameBranchFromWorkDefaultOn } from '@yiru/runtime-protocol/workbench/auto-rename-branch-from-work-settings'
import { getDefaultSettings } from '@yiru/runtime-protocol/workbench/constants'
import { normalizeLoaderStyle } from '@yiru/runtime-protocol/workbench/loader-style'
import { normalizeOpenInApplications } from '@yiru/runtime-protocol/workbench/open-in-applications'
import { deriveGlobalWindowsRuntimeDefaultFromLegacySettings } from '@yiru/runtime-protocol/workbench/project-execution-runtime'
import {
  mergeLegacyCommitMessageAiIntoSourceControlAi,
  projectSourceControlAiToLegacyCommitMessageAi,
  sourceControlAiSettingsFromLegacy
} from '@yiru/runtime-protocol/workbench/source-control/ai'
import { normalizeSourceControlGroupOrder } from '@yiru/runtime-protocol/workbench/source-control/group-order'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'
import { normalizeUiLanguage } from '@yiru/runtime-protocol/workbench/ui-language'

import { decodePersistedAgentSettings } from './persisted-agent-settings-codec'
import { normalizePersistedNotificationSettings } from './persisted-notification-settings-codec'
import { decodePersistedTerminalSettings } from './persisted-terminal-settings-codec'

export type PersistedSettingsCodecContext = {
  homeDir: string
  platform: NodeJS.Platform
}

export type PersistedSettingsDecodeResult = {
  settings: GlobalSettings
  needsSave: boolean
}

type RetiredGlobalSettings = Partial<GlobalSettings> & {
  terminalScrollbackBytes?: unknown
  experimentalNewWorktreeCardStyle?: unknown
  compactWorktreeCards?: unknown
  experimentalCompactWorktreeCards?: unknown
  experimentalActivity?: unknown
  experimentalActivityDefaultedOffForAllUsers?: unknown
  floatingTerminalCwd?: unknown
  floatingTerminalCwdMigratedToAppWorkspace?: unknown
  floatingTerminalDefaultedForAllUsers?: unknown
  floatingTerminalEnabled?: unknown
  floatingTerminalTriggerLocation?: unknown
  floatingTerminalTrustedCwds?: unknown
}

// Why: settings use object-spread merges, so retired disk keys must be
// removed explicitly or every later save would preserve dead product state.
export function stripRetiredGlobalSettings(
  value: RetiredGlobalSettings | undefined
): Partial<GlobalSettings> {
  const {
    terminalScrollbackBytes: _scrollbackBytes,
    experimentalNewWorktreeCardStyle: _newCardStyle,
    compactWorktreeCards: _compactCards,
    experimentalCompactWorktreeCards: _experimentalCompactCards,
    experimentalActivity: _experimentalActivity,
    experimentalActivityDefaultedOffForAllUsers: _experimentalActivityMigration,
    floatingTerminalCwd: _floatingTerminalCwd,
    floatingTerminalCwdMigratedToAppWorkspace: _floatingTerminalCwdMigration,
    floatingTerminalDefaultedForAllUsers: _floatingTerminalDefault,
    floatingTerminalEnabled: _floatingTerminalEnabled,
    floatingTerminalTriggerLocation: _floatingTerminalTriggerLocation,
    floatingTerminalTrustedCwds: _floatingTerminalTrustedCwds,
    ...settings
  } = value ?? {}
  void _scrollbackBytes
  void _newCardStyle
  void _compactCards
  void _experimentalCompactCards
  void _experimentalActivity
  void _experimentalActivityMigration
  void _floatingTerminalCwd
  void _floatingTerminalCwdMigration
  void _floatingTerminalDefault
  void _floatingTerminalEnabled
  void _floatingTerminalTriggerLocation
  void _floatingTerminalTrustedCwds
  return settings
}

export function decodePersistedSettings(
  value: Partial<GlobalSettings> | undefined,
  context: PersistedSettingsCodecContext
): PersistedSettingsDecodeResult {
  const defaults = getDefaultSettings(context.homeDir)
  const raw = value ?? {}
  const terminal = decodePersistedTerminalSettings(raw, defaults)
  const agents = decodePersistedAgentSettings(raw)
  const rawSourceControlAi = raw.sourceControlAi
  const sourceControlAiMissing = rawSourceControlAi === undefined
  const sourceControlAiActionsMissing =
    rawSourceControlAi !== undefined && rawSourceControlAi.actions === undefined
  const sourceControlAi = sourceControlAiMissing
    ? sourceControlAiSettingsFromLegacy(raw.commitMessageAi ?? defaults.commitMessageAi)
    : mergeLegacyCommitMessageAiIntoSourceControlAi(rawSourceControlAi, raw.commitMessageAi)
  const sourceControlGroupOrder = normalizeSourceControlGroupOrder(raw.sourceControlGroupOrder)
  const autoRenameBranchFromWork = normalizeAutoRenameBranchFromWorkDefaultOn(raw)
  const localWindowsRuntimeDefault =
    raw.localWindowsRuntimeDefault ??
    deriveGlobalWindowsRuntimeDefaultFromLegacySettings(raw).defaultRuntime
  const hasRetiredCardSettings = [
    'experimentalNewWorktreeCardStyle',
    'compactWorktreeCards',
    'experimentalCompactWorktreeCards'
  ].some((key) => Object.hasOwn(raw, key))
  const hasRetiredActivitySettings = [
    'experimentalActivity',
    'experimentalActivityDefaultedOffForAllUsers'
  ].some((key) => Object.hasOwn(raw, key))
  const hasRetiredFloatingTerminalSettings = [
    'floatingTerminalCwd',
    'floatingTerminalCwdMigratedToAppWorkspace',
    'floatingTerminalDefaultedForAllUsers',
    'floatingTerminalEnabled',
    'floatingTerminalTriggerLocation',
    'floatingTerminalTrustedCwds'
  ].some((key) => Object.hasOwn(raw, key))

  return {
    settings: {
      ...defaults,
      ...stripRetiredGlobalSettings(raw),
      prBotAuthorOverrides: normalizePRBotAuthorOverrides(raw.prBotAuthorOverrides),
      ...terminal.settings,
      ...agents.settings,
      ...autoRenameBranchFromWork,
      localWindowsRuntimeDefault,
      minimizeToTrayOnClose: raw.minimizeToTrayOnClose === true,
      showMenuBarIcon: raw.showMenuBarIcon !== false,
      showPinnedWorktreesInGroups: raw.showPinnedWorktreesInGroups === true,
      uiLanguage: normalizeUiLanguage(raw.uiLanguage),
      appIcon: normalizeAppIconId(raw.appIcon),
      loaderStyle: normalizeLoaderStyle(raw.loaderStyle),
      openInApplications: normalizeOpenInApplications(raw.openInApplications, {
        seedDefaults: true
      }),
      notifications: normalizePersistedNotificationSettings(raw.notifications),
      sourceControlAi,
      sourceControlGroupOrder,
      commitMessageAi: projectSourceControlAiToLegacyCommitMessageAi(
        sourceControlAi,
        raw.commitMessageAi ?? defaults.commitMessageAi
      )
    },
    needsSave:
      terminal.needsSave ||
      agents.needsSave ||
      sourceControlAiMissing ||
      sourceControlAiActionsMissing ||
      raw.autoRenameBranchFromWorkDefaultedOn !== true ||
      (raw.localWindowsRuntimeDefault === undefined && localWindowsRuntimeDefault.kind === 'wsl') ||
      hasRetiredCardSettings ||
      hasRetiredActivitySettings ||
      hasRetiredFloatingTerminalSettings ||
      (raw.sourceControlGroupOrder !== undefined &&
        raw.sourceControlGroupOrder !== sourceControlGroupOrder)
  }
}
