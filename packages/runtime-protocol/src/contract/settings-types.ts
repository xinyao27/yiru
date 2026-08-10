import type { TuiAgent } from '@yiru/workbench-model/agent'
import type { TerminalQuickCommand } from '@yiru/workbench-model/ui'

export type RuntimeClientSettings = {
  defaultTuiAgent: TuiAgent | 'blank' | null
  disabledTuiAgents: TuiAgent[]
  agentCmdOverrides: Partial<Record<TuiAgent, string>>
  agentDefaultArgs: Partial<Record<TuiAgent, string>>
  agentDefaultEnv: Partial<Record<TuiAgent, Record<string, string>>>
  agentStatusHooksEnabled: boolean
  minimaxGroupId: string
  minimaxUsageModels: string
  prBotAuthorOverrides: string[]
}

export type RuntimeSettingsResult = { settings: RuntimeClientSettings }
export type RuntimeTerminalQuickCommandsResult = {
  terminalQuickCommands: TerminalQuickCommand[]
}

// Why: mirrors the desktop `GhosttyImportPreview` shared type. `diff` is
// really `Partial<GlobalSettings>`, a desktop-only type this client-safe
// package cannot import — callers already know the concrete shape from
// `~shared/types` and narrow it back there.
export type RuntimeGhosttyImportPreview = {
  found: boolean
  configPath?: string
  configPaths?: string[]
  diff: Record<string, unknown>
  unsupportedKeys: string[]
  error?: string
}

// Why: mirrors the desktop `WarpThemeImportPreviewTheme` shared type.
// `terminal` is really `TerminalColorOverrides` (`~shared/types`), widened
// for the same reason as `RuntimeGhosttyImportPreview.diff` above.
export type RuntimeWarpThemeImportPreviewTheme = {
  id: string
  name: string
  source: 'warp' | 'ghostty' | 'manual'
  mode: 'dark' | 'light' | 'unknown'
  terminal: Record<string, unknown>
  importedAt: string
  sourceLabel?: string
  unsupportedFeatures?: string[]
  selectionValue: string
}

export type RuntimeWarpThemeImportSkippedFile = {
  label: string
  reason: string
}

export type RuntimeWarpThemeImportPreview = {
  found: boolean
  /** True when the user dismissed the native picker without selecting anything. */
  canceled?: boolean
  desktopOnly?: boolean
  sourceLabel?: string
  themes: RuntimeWarpThemeImportPreviewTheme[]
  skippedFiles: RuntimeWarpThemeImportSkippedFile[]
  error?: string
}
