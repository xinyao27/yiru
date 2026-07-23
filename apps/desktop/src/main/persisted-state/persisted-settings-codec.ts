import { normalizePRBotAuthorOverrides } from '@yiru/workbench-model/review'

import { normalizeAppIconId } from '../../shared/app-icon'
import { normalizeAutoRenameBranchFromWorkDefaultOn } from '../../shared/auto-rename-branch-from-work-settings'
import { getDefaultSettings, getDefaultVoiceSettings } from '../../shared/constants'
import { normalizeLanguageServerSettings } from '../../shared/language-server'
import { normalizeLoaderStyle } from '../../shared/loader-style'
import { normalizeOpenInApplications } from '../../shared/open-in-applications'
import { deriveGlobalWindowsRuntimeDefaultFromLegacySettings } from '../../shared/project-execution-runtime'
import {
  mergeLegacyCommitMessageAiIntoSourceControlAi,
  projectSourceControlAiToLegacyCommitMessageAi,
  sourceControlAiSettingsFromLegacy
} from '../../shared/source-control-ai'
import { normalizeSourceControlGroupOrder } from '../../shared/source-control-group-order'
import type { GlobalSettings } from '../../shared/types'
import { normalizeUiLanguage } from '../../shared/ui-language'
import { decodePersistedAgentSettings } from './persisted-agent-settings-codec'
import { decodePersistedFloatingWorkspaceSettings } from './persisted-floating-workspace-settings-codec'
import { normalizePersistedNotificationSettings } from './persisted-notification-settings-codec'
import { decodePersistedTerminalSettings } from './persisted-terminal-settings-codec'

export type PersistedSettingsCodecContext = {
  homeDir: string
  platform: NodeJS.Platform
  legacySidekickEnabled?: boolean
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
}

// Why: settings use object-spread merges, so retired disk keys must be
// removed explicitly or every later save would preserve dead product state.
export function stripRetiredGlobalSettings(
  value: Partial<GlobalSettings> | undefined
): Partial<GlobalSettings> {
  const {
    terminalScrollbackBytes: _scrollbackBytes,
    experimentalNewWorktreeCardStyle: _newCardStyle,
    compactWorktreeCards: _compactCards,
    experimentalCompactWorktreeCards: _experimentalCompactCards,
    ...settings
  } = (value ?? {}) as RetiredGlobalSettings
  void _scrollbackBytes
  void _newCardStyle
  void _compactCards
  void _experimentalCompactCards
  return settings
}

export function decodePersistedSettings(
  value: Partial<GlobalSettings> | undefined,
  context: PersistedSettingsCodecContext
): PersistedSettingsDecodeResult {
  const defaults = getDefaultSettings(context.homeDir)
  const raw = value ?? {}
  const terminal = decodePersistedTerminalSettings(raw, defaults, context.platform)
  const agents = decodePersistedAgentSettings(raw)
  const floatingWorkspace = decodePersistedFloatingWorkspaceSettings(
    raw,
    defaults,
    context.homeDir,
    context.platform
  )
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

  return {
    settings: {
      ...defaults,
      ...stripRetiredGlobalSettings(raw),
      prBotAuthorOverrides: normalizePRBotAuthorOverrides(raw.prBotAuthorOverrides),
      experimentalPet: raw.experimentalPet ?? context.legacySidekickEnabled ?? false,
      ...terminal.settings,
      ...agents.settings,
      ...floatingWorkspace.settings,
      ...autoRenameBranchFromWork,
      localWindowsRuntimeDefault,
      experimentalActivity:
        raw.experimentalActivityDefaultedOffForAllUsers === true
          ? (raw.experimentalActivity ?? false)
          : false,
      experimentalActivityDefaultedOffForAllUsers: true,
      minimizeToTrayOnClose: raw.minimizeToTrayOnClose === true,
      showMenuBarIcon: raw.showMenuBarIcon !== false,
      uiLanguage: normalizeUiLanguage(raw.uiLanguage),
      appIcon: normalizeAppIconId(raw.appIcon),
      loaderStyle: normalizeLoaderStyle(raw.loaderStyle),
      languageServer: normalizeLanguageServerSettings(raw.languageServer),
      openInApplications: normalizeOpenInApplications(raw.openInApplications, {
        seedDefaults: true
      }),
      notifications: normalizePersistedNotificationSettings(raw.notifications),
      sourceControlAi,
      sourceControlGroupOrder,
      commitMessageAi: projectSourceControlAiToLegacyCommitMessageAi(
        sourceControlAi,
        raw.commitMessageAi ?? defaults.commitMessageAi
      ),
      voice: { ...getDefaultVoiceSettings(), ...raw.voice }
    },
    needsSave:
      terminal.needsSave ||
      agents.needsSave ||
      floatingWorkspace.needsSave ||
      sourceControlAiMissing ||
      sourceControlAiActionsMissing ||
      raw.autoRenameBranchFromWorkDefaultedOn !== true ||
      (raw.localWindowsRuntimeDefault === undefined && localWindowsRuntimeDefault.kind === 'wsl') ||
      hasRetiredCardSettings ||
      (raw.sourceControlGroupOrder !== undefined &&
        raw.sourceControlGroupOrder !== sourceControlGroupOrder)
  }
}
