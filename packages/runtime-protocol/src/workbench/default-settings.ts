import { DEFAULT_APP_ICON_ID } from './app-icon'
import {
  DEFAULT_LEFT_SIDEBAR_TINT_COLOR,
  DEFAULT_LEFT_SIDEBAR_TINT_OPACITY
} from './left-sidebar-appearance'
import { DEFAULT_LOADER_STYLE } from './loader-style'
import { DEFAULT_OPEN_IN_APPLICATIONS } from './open-in-applications'
import { getDefaultSourceControlAiSettings } from './source-control/ai'
import { DEFAULT_SOURCE_CONTROL_GROUP_ORDER } from './source-control/group-order'
import { DEFAULT_TERMINAL_FONT_SIZE, DEFAULT_TERMINAL_FONT_WEIGHT } from './terminal/fonts'
import { getDefaultTerminalQuickCommands } from './terminal/quick-commands'
import { DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT } from './terminal/scrollback-policy'
import { DEFAULT_TUI_AGENT_ARGS, DEFAULT_TUI_AGENT_ENV } from './tui-agent/launch-defaults'
import { DEFAULT_DISABLED_TUI_AGENTS } from './tui-agent/selection'
import type { GlobalSettings, NotificationSettings } from './types'
import { UI_LANGUAGE_SYSTEM } from './ui-language'

export const DEFAULT_APP_FONT_FAMILY = 'system-ui'
export const DEFAULT_EDITOR_AUTO_SAVE_DELAY_MS = 1000
export const MIN_EDITOR_AUTO_SAVE_DELAY_MS = 250
export const MAX_EDITOR_AUTO_SAVE_DELAY_MS = 10_000

function defaultTerminalFontFamily(): string {
  const platform = typeof process !== 'undefined' ? process.platform : ''
  if (platform === 'win32') {
    return 'Cascadia Mono'
  }
  if (platform === 'linux') {
    return 'DejaVu Sans Mono'
  }
  return 'SF Mono'
}

export const getDefaultTerminalRightClickToPaste = (
  platform = typeof process !== 'undefined' ? process.platform : ''
): boolean => platform === 'win32'

export function getDefaultNotificationSettings(): NotificationSettings {
  return {
    enabled: true,
    agentTaskComplete: true,
    terminalBell: false,
    suppressWhenFocused: true,
    customSoundId: 'system',
    customSoundPath: null,
    customSoundVolume: 100
  }
}

function getDefaultWorkspaceDir(homeDir: string): string {
  const separator = homeDir.includes('\\') ? '\\' : '/'
  const trimmedHomeDir = homeDir.replace(/[\\/]+$/, '')
  return [trimmedHomeDir, 'yiru', 'workspaces'].join(separator)
}

export function getDefaultSettings(homedir: string): GlobalSettings {
  return {
    workspaceDir: getDefaultWorkspaceDir(homedir),
    nestWorkspaces: true,
    workspaceDirHistory: [],
    refreshLocalBaseRefOnWorktreeCreate: false,
    localBaseRefSuggestionDismissed: false,
    autoRenameBranchFromWork: true,
    autoRenameBranchFromWorkDefaultedOn: true,
    branchPrefix: 'git-username',
    branchPrefixCustom: '',
    enableGitHubAttribution: false,
    theme: 'system',
    leftSidebarAppearanceMode: 'default',
    leftSidebarTintColor: DEFAULT_LEFT_SIDEBAR_TINT_COLOR,
    leftSidebarTintOpacity: DEFAULT_LEFT_SIDEBAR_TINT_OPACITY,
    uiLanguage: UI_LANGUAGE_SYSTEM,
    appIcon: DEFAULT_APP_ICON_ID,
    loaderStyle: DEFAULT_LOADER_STYLE,
    appFontFamily: DEFAULT_APP_FONT_FAMILY,
    systemTypographyDefaultsMigrated: true,
    editorAutoSave: false,
    editorAutoSaveDelayMs: DEFAULT_EDITOR_AUTO_SAVE_DELAY_MS,
    editorMinimapEnabled: false,
    // Why empty: editors keep following the terminal font unless the user opts in.
    editorFontFamily: '',
    editorWordWrap: true,
    richMarkdownSpellcheckEnabled: true,
    markdownReviewToolsEnabled: true,
    terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
    terminalFontFamily: defaultTerminalFontFamily(),
    terminalFontWeight: DEFAULT_TERMINAL_FONT_WEIGHT,
    terminalLineHeight: 1,
    terminalScrollSensitivity: 1.15,
    terminalFastScrollSensitivity: 5,
    terminalTuiScrollSensitivity: 1,
    terminalTuiScrollSensitivityDefaultedToOne: true,
    terminalGpuAcceleration: 'auto',
    terminalLigatures: 'auto',
    terminalCursorStyle: 'block',
    terminalCursorStyleDefaultedToBlock: true,
    terminalCursorBlink: true,
    terminalThemeDark: 'Ghostty Default Style Dark',
    terminalDividerColorDark: '#3f3f46',
    terminalUseSeparateLightTheme: true,
    terminalThemeLight: 'Builtin Tango Light',
    terminalCustomThemes: [],
    terminalDividerColorLight: '#d4d4d8',
    terminalInactivePaneOpacity: 0.8,
    terminalActivePaneOpacity: 1,
    terminalPaneOpacityTransitionMs: 140,
    terminalDividerThicknessPx: 1,
    terminalDividerThicknessDefaultedToHairline: true,
    terminalRightClickToPaste: getDefaultTerminalRightClickToPaste(),
    terminalRightClickToPasteDefaultedForPlatform: true,
    terminalWindowsShell: 'powershell.exe',
    terminalWindowsWslDistro: null,
    localAccountRuntime: 'host',
    localAccountWslDistro: null,
    localWindowsRuntimeDefault: { kind: 'windows-host' },
    terminalWindowsPowerShellImplementation: 'auto',
    terminalMouseHideWhileTyping: false,
    terminalQuickCommands: getDefaultTerminalQuickCommands(),
    terminalFocusFollowsMouse: false,
    windowBackgroundBlur: false,
    minimizeToTrayOnClose: false,
    showMenuBarIcon: true,
    showPinnedWorktreesInGroups: false,
    terminalClipboardOnSelect: false,
    terminalAllowOsc52Clipboard: false,
    claudeAgentTeamsMode: 'off',
    setupScriptLaunchMode: 'new-tab',
    terminalScrollbackRows: DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT,
    httpProxyUrl: '',
    httpProxyBypassRules: '',
    electronHttp1CompatibilityMode: false,
    localhostWorktreeLabelsEnabled: false,
    openInApplications: [...DEFAULT_OPEN_IN_APPLICATIONS],
    lastOpenInTargetKey: 'application:vscode',
    rightSidebarOpenByDefault: true,
    showGitIgnoredFiles: true,
    sourceControlViewMode: 'list',
    sourceControlGroupOrder: DEFAULT_SOURCE_CONTROL_GROUP_ORDER,
    sourceControlCompareAgainstUpstream: false,
    showTitlebarAppName: true,
    showMobileButton: true,
    ctrlTabOrderMode: 'mru',
    terminalShortcutPolicy: 'yiru-first',
    notifications: getDefaultNotificationSettings(),
    diffDefaultView: 'inline',
    diffWordWrap: false,
    prBotAuthorOverrides: [],
    promptCacheTimerEnabled: false,
    promptCacheTtlMs: 300_000,
    codexManagedAccounts: [],
    activeCodexManagedAccountId: null,
    activeCodexManagedAccountIdsByRuntime: { host: null, wsl: {} },
    claudeManagedAccounts: [],
    activeClaudeManagedAccountId: null,
    terminalScopeHistoryByWorktree: true,
    terminalHiddenViewParking: true,
    defaultTuiAgent: null,
    disabledTuiAgents: [...DEFAULT_DISABLED_TUI_AGENTS],
    claudeAgentTeamsDefaultDisabledMigrated: true,
    skipDeleteWorktreeConfirm: false,
    skipCloseTerminalWithRunningProcessConfirm: false,
    skipCodexRateLimitResetConfirm: false,
    opencodeSessionCookie: '',
    opencodeWorkspaceId: '',
    minimaxGroupId: '',
    minimaxUsageModels: 'general',
    geminiCliOAuthEnabled: false,
    agentCmdOverrides: {},
    agentDefaultArgs: { ...DEFAULT_TUI_AGENT_ARGS },
    agentDefaultEnv: { ...DEFAULT_TUI_AGENT_ENV },
    agentYoloDefaultsMigrated: true,
    agentStatusHooksEnabled: true,
    tabAutoGenerateTitle: false,
    confirmClosePinnedTab: true,
    keepComputerAwakeWhileAgentsRun: false,
    terminalMacOptionAsAlt: 'auto',
    terminalMacOptionAsAltMigrated: false,
    terminalJISYenToBackslash: false,
    experimentalMobile: false,
    mobileEmulatorEnabled: true,
    mobileEmulatorDefaultDeviceUdid: null,
    androidSdkPath: null,
    mobileAutoRestoreFitMs: null,
    experimentalTerminalAttention: false,
    experimentalAgentHibernation: false,
    agentHibernationIdleMs: 30 * 60 * 1000,
    activeRuntimeEnvironmentId: null,
    commitMessageAi: {
      enabled: true,
      agentId: null,
      selectedModelByAgent: {},
      discoveredModelsByAgent: {},
      selectedModelByAgentByHost: {},
      discoveredModelsByAgentByHost: {},
      selectedThinkingByModel: {},
      customPrompt: '',
      customAgentCommand: ''
    },
    sourceControlAi: getDefaultSourceControlAiSettings()
  }
}
