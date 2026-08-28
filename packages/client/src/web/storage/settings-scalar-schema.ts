import { normalizeAppIconId } from '@yiru/runtime-protocol/workbench/app-icon'
import { normalizeLoaderStyle } from '@yiru/runtime-protocol/workbench/loader-style'
import { isTuiAgent } from '@yiru/runtime-protocol/workbench/tui-agent/config'
import type { GlobalSettings, OpenInTargetKey } from '@yiru/runtime-protocol/workbench/types'
import { normalizeUiLanguage } from '@yiru/runtime-protocol/workbench/ui-language'
import { z } from 'zod'

const finiteNumber = z.number().finite()
const optionalBoolean = z.boolean().optional()
const optionalFiniteNumber = finiteNumber.optional()
const optionalString = z.string().optional()
const nullableString = z.string().nullable()
const optionalNullableString = nullableString.optional()

const tuiAgent = z.string().transform((value, context) => {
  if (isTuiAgent(value)) {
    return value
  }
  context.addIssue({ code: 'custom' })
  return z.NEVER
})

const appIcon = z.string().transform((value, context) => {
  const normalized = normalizeAppIconId(value)
  if (normalized === value) {
    return normalized
  }
  context.addIssue({ code: 'custom' })
  return z.NEVER
})

const loaderStyle = z.string().transform((value, context) => {
  const normalized = normalizeLoaderStyle(value)
  if (normalized === value) {
    return normalized
  }
  context.addIssue({ code: 'custom' })
  return z.NEVER
})

const uiLanguage = z.string().transform((value, context) => {
  const normalized = normalizeUiLanguage(value)
  if (normalized === value) {
    return normalized
  }
  context.addIssue({ code: 'custom' })
  return z.NEVER
})

const openInTargetKey = z.string().transform((value, context) => {
  if (isOpenInTargetKey(value)) {
    return value
  }
  context.addIssue({ code: 'custom' })
  return z.NEVER
})

function isOpenInTargetKey(value: string): value is OpenInTargetKey {
  return value === 'file-manager' || value.startsWith('application:')
}

export function createScalarSettingSchemas(defaults: GlobalSettings) {
  return {
    workspaceDir: z.string().catch(defaults.workspaceDir),
    nestWorkspaces: z.boolean().catch(defaults.nestWorkspaces),
    refreshLocalBaseRefOnWorktreeCreate: z
      .boolean()
      .catch(defaults.refreshLocalBaseRefOnWorktreeCreate),
    localBaseRefSuggestionDismissed: z.boolean().catch(defaults.localBaseRefSuggestionDismissed),
    autoRenameBranchFromWork: z.boolean().catch(defaults.autoRenameBranchFromWork),
    autoRenameBranchFromWorkDefaultedOn: optionalBoolean.catch(
      defaults.autoRenameBranchFromWorkDefaultedOn
    ),
    branchPrefix: z.enum(['git-username', 'custom', 'none']).catch(defaults.branchPrefix),
    branchPrefixCustom: z.string().catch(defaults.branchPrefixCustom),
    enableGitHubAttribution: z.boolean().catch(defaults.enableGitHubAttribution),
    theme: z.enum(['system', 'dark', 'light']).catch(defaults.theme),
    leftSidebarAppearanceMode: z
      .enum(['default', 'match-terminal', 'tinted'])
      .catch(defaults.leftSidebarAppearanceMode),
    leftSidebarTintColor: optionalString.catch(defaults.leftSidebarTintColor),
    leftSidebarTintOpacity: optionalFiniteNumber.catch(defaults.leftSidebarTintOpacity),
    uiLanguage: uiLanguage.catch(defaults.uiLanguage),
    appIcon: appIcon.catch(defaults.appIcon),
    loaderStyle: loaderStyle.optional().catch(defaults.loaderStyle),
    appFontFamily: z.string().catch(defaults.appFontFamily),
    systemTypographyDefaultsMigrated: optionalBoolean.catch(
      defaults.systemTypographyDefaultsMigrated
    ),
    editorAutoSave: z.boolean().catch(defaults.editorAutoSave),
    editorAutoSaveDelayMs: finiteNumber.catch(defaults.editorAutoSaveDelayMs),
    editorMinimapEnabled: z.boolean().catch(defaults.editorMinimapEnabled),
    editorFontFamily: optionalString.catch(defaults.editorFontFamily),
    editorWordWrap: optionalBoolean.catch(defaults.editorWordWrap),
    richMarkdownSpellcheckEnabled: optionalBoolean.catch(defaults.richMarkdownSpellcheckEnabled),
    markdownReviewToolsEnabled: z.boolean().catch(defaults.markdownReviewToolsEnabled),
    terminalFontSize: finiteNumber.catch(defaults.terminalFontSize),
    terminalFontFamily: z.string().catch(defaults.terminalFontFamily),
    terminalFontWeight: finiteNumber.catch(defaults.terminalFontWeight),
    terminalLineHeight: finiteNumber.catch(defaults.terminalLineHeight),
    terminalScrollSensitivity: finiteNumber.catch(defaults.terminalScrollSensitivity),
    terminalFastScrollSensitivity: finiteNumber.catch(defaults.terminalFastScrollSensitivity),
    terminalTuiScrollSensitivity: finiteNumber.catch(defaults.terminalTuiScrollSensitivity),
    terminalTuiScrollSensitivityDefaultedToOne: optionalBoolean.catch(
      defaults.terminalTuiScrollSensitivityDefaultedToOne
    ),
    terminalGpuAcceleration: z.enum(['auto', 'on', 'off']).catch(defaults.terminalGpuAcceleration),
    terminalLigatures: z.enum(['auto', 'on', 'off']).catch(defaults.terminalLigatures),
    terminalCursorStyle: z.enum(['bar', 'block', 'underline']).catch(defaults.terminalCursorStyle),
    terminalCursorStyleDefaultedToBlock: optionalBoolean.catch(
      defaults.terminalCursorStyleDefaultedToBlock
    ),
    terminalCursorBlink: z.boolean().catch(defaults.terminalCursorBlink),
    terminalThemeDark: z.string().catch(defaults.terminalThemeDark),
    terminalDividerColorDark: z.string().catch(defaults.terminalDividerColorDark),
    terminalUseSeparateLightTheme: z.boolean().catch(defaults.terminalUseSeparateLightTheme),
    terminalThemeLight: z.string().catch(defaults.terminalThemeLight),
    terminalDividerColorLight: z.string().catch(defaults.terminalDividerColorLight),
    terminalInactivePaneOpacity: finiteNumber.catch(defaults.terminalInactivePaneOpacity),
    terminalActivePaneOpacity: finiteNumber.catch(defaults.terminalActivePaneOpacity),
    terminalPaneOpacityTransitionMs: finiteNumber.catch(defaults.terminalPaneOpacityTransitionMs),
    terminalDividerThicknessPx: finiteNumber.catch(defaults.terminalDividerThicknessPx),
    terminalDividerThicknessDefaultedToHairline: optionalBoolean.catch(
      defaults.terminalDividerThicknessDefaultedToHairline
    ),
    terminalBackgroundOpacity: optionalFiniteNumber.catch(defaults.terminalBackgroundOpacity),
    terminalPaddingX: optionalFiniteNumber.catch(defaults.terminalPaddingX),
    terminalPaddingY: optionalFiniteNumber.catch(defaults.terminalPaddingY),
    terminalMouseHideWhileTyping: optionalBoolean.catch(defaults.terminalMouseHideWhileTyping),
    terminalWordSeparator: optionalString.catch(defaults.terminalWordSeparator),
    terminalCursorOpacity: optionalFiniteNumber.catch(defaults.terminalCursorOpacity),
    windowBackgroundBlur: optionalBoolean.catch(defaults.windowBackgroundBlur),
    minimizeToTrayOnClose: optionalBoolean.catch(defaults.minimizeToTrayOnClose),
    showMenuBarIcon: optionalBoolean.catch(defaults.showMenuBarIcon),
    showPinnedWorktreesInGroups: optionalBoolean.catch(defaults.showPinnedWorktreesInGroups),
    terminalRightClickToPaste: z.boolean().catch(defaults.terminalRightClickToPaste),
    terminalRightClickToPasteDefaultedForPlatform: optionalBoolean.catch(
      defaults.terminalRightClickToPasteDefaultedForPlatform
    ),
    terminalWindowsShell: z.string().catch(defaults.terminalWindowsShell),
    terminalWindowsWslDistro: optionalNullableString.catch(defaults.terminalWindowsWslDistro),
    localAccountRuntime: z.enum(['host', 'wsl']).catch(defaults.localAccountRuntime),
    localAccountWslDistro: optionalNullableString.catch(defaults.localAccountWslDistro),
    localAgentRuntime: z.enum(['host', 'wsl']).optional().catch(defaults.localAgentRuntime),
    localAgentWslDistro: optionalNullableString.catch(defaults.localAgentWslDistro),
    terminalWindowsPowerShellImplementation: z
      .enum(['auto', 'powershell.exe', 'pwsh.exe'])
      .catch(defaults.terminalWindowsPowerShellImplementation),
    terminalFocusFollowsMouse: z.boolean().catch(defaults.terminalFocusFollowsMouse),
    terminalClipboardOnSelect: z.boolean().catch(defaults.terminalClipboardOnSelect),
    terminalAllowOsc52Clipboard: z.boolean().catch(defaults.terminalAllowOsc52Clipboard),
    claudeAgentTeamsMode: z
      .enum(['off', 'in-process', 'native-panes-shim'])
      .optional()
      .catch(defaults.claudeAgentTeamsMode),
    setupScriptLaunchMode: z
      .enum(['split-vertical', 'split-horizontal', 'new-tab'])
      .catch(defaults.setupScriptLaunchMode),
    terminalScrollbackRows: finiteNumber.catch(defaults.terminalScrollbackRows),
    httpProxyUrl: optionalString.catch(defaults.httpProxyUrl),
    httpProxyBypassRules: optionalString.catch(defaults.httpProxyBypassRules),
    electronHttp1CompatibilityMode: optionalBoolean.catch(defaults.electronHttp1CompatibilityMode),
    localhostWorktreeLabelsEnabled: optionalBoolean.catch(defaults.localhostWorktreeLabelsEnabled),
    lastOpenInTargetKey: openInTargetKey.optional().catch(defaults.lastOpenInTargetKey),
    rightSidebarOpenByDefault: z.boolean().catch(defaults.rightSidebarOpenByDefault),
    showGitIgnoredFiles: optionalBoolean.catch(defaults.showGitIgnoredFiles),
    sourceControlViewMode: z.enum(['list', 'tree']).catch(defaults.sourceControlViewMode),
    sourceControlGroupOrder: z
      .enum(['changes-first', 'staged-first', 'untracked-first'])
      .catch(defaults.sourceControlGroupOrder),
    sourceControlCompareAgainstUpstream: z
      .boolean()
      .catch(defaults.sourceControlCompareAgainstUpstream),
    showTitlebarAppName: z.boolean().catch(defaults.showTitlebarAppName),
    showMobileButton: optionalBoolean.catch(defaults.showMobileButton),
    ctrlTabOrderMode: z.enum(['mru', 'sequential']).optional().catch(defaults.ctrlTabOrderMode),
    terminalShortcutPolicy: z
      .enum(['yiru-first', 'terminal-first'])
      .optional()
      .catch(defaults.terminalShortcutPolicy),
    diffDefaultView: z.enum(['inline', 'side-by-side']).catch(defaults.diffDefaultView),
    diffWordWrap: z.boolean().catch(defaults.diffWordWrap),
    promptCacheTimerEnabled: z.boolean().catch(defaults.promptCacheTimerEnabled),
    promptCacheTtlMs: z
      .union([z.literal(300_000), z.literal(3_600_000)])
      .transform((value): number => value)
      .catch(defaults.promptCacheTtlMs),
    activeCodexManagedAccountId: nullableString.catch(defaults.activeCodexManagedAccountId),
    activeClaudeManagedAccountId: nullableString.catch(defaults.activeClaudeManagedAccountId),
    terminalScopeHistoryByWorktree: z.boolean().catch(defaults.terminalScopeHistoryByWorktree),
    terminalHiddenViewParking: optionalBoolean.catch(defaults.terminalHiddenViewParking),
    terminalSshViewParking: optionalBoolean.catch(defaults.terminalSshViewParking),
    terminalHiddenWorktreeRetentionBudget: optionalBoolean.catch(
      defaults.terminalHiddenWorktreeRetentionBudget
    ),
    defaultTuiAgent: z
      .union([tuiAgent, z.literal('blank'), z.null()])
      .catch(defaults.defaultTuiAgent),
    claudeAgentTeamsDefaultDisabledMigrated: optionalBoolean.catch(
      defaults.claudeAgentTeamsDefaultDisabledMigrated
    ),
    skipDeleteWorktreeConfirm: z.boolean().catch(defaults.skipDeleteWorktreeConfirm),
    skipCloseTerminalWithRunningProcessConfirm: z
      .boolean()
      .catch(defaults.skipCloseTerminalWithRunningProcessConfirm),
    skipCodexRateLimitResetConfirm: z.boolean().catch(defaults.skipCodexRateLimitResetConfirm),
    opencodeSessionCookie: z.string().catch(defaults.opencodeSessionCookie),
    opencodeWorkspaceId: z.string().catch(defaults.opencodeWorkspaceId),
    minimaxGroupId: z.string().catch(defaults.minimaxGroupId),
    minimaxUsageModels: z.string().catch(defaults.minimaxUsageModels),
    geminiCliOAuthEnabled: z.boolean().catch(defaults.geminiCliOAuthEnabled),
    agentYoloDefaultsMigrated: optionalBoolean.catch(defaults.agentYoloDefaultsMigrated),
    agentStatusHooksEnabled: z.boolean().catch(defaults.agentStatusHooksEnabled),
    tabAutoGenerateTitle: z.boolean().catch(defaults.tabAutoGenerateTitle),
    confirmClosePinnedTab: z.boolean().catch(defaults.confirmClosePinnedTab),
    keepComputerAwakeWhileAgentsRun: z.boolean().catch(defaults.keepComputerAwakeWhileAgentsRun),
    terminalMacOptionAsAlt: z
      .enum(['auto', 'true', 'false', 'left', 'right'])
      .catch(defaults.terminalMacOptionAsAlt),
    terminalMacOptionAsAltMigrated: z.boolean().catch(defaults.terminalMacOptionAsAltMigrated),
    terminalJISYenToBackslash: z.boolean().catch(defaults.terminalJISYenToBackslash),
    experimentalMobile: z.boolean().catch(defaults.experimentalMobile),
    mobileEmulatorEnabled: optionalBoolean.catch(defaults.mobileEmulatorEnabled),
    mobileEmulatorDefaultDeviceUdid: optionalNullableString.catch(
      defaults.mobileEmulatorDefaultDeviceUdid
    ),
    androidSdkPath: optionalNullableString.catch(defaults.androidSdkPath),
    mobileAutoRestoreFitMs: z
      .union([finiteNumber, z.null()])
      .catch(defaults.mobileAutoRestoreFitMs),
    experimentalTerminalAttention: z.boolean().catch(defaults.experimentalTerminalAttention),
    experimentalAgentHibernation: optionalBoolean.catch(defaults.experimentalAgentHibernation),
    agentHibernationIdleMs: optionalFiniteNumber.catch(defaults.agentHibernationIdleMs),
    activeRuntimeEnvironmentId: optionalNullableString.catch(defaults.activeRuntimeEnvironmentId)
  }
}
