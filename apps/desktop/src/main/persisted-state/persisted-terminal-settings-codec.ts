import { normalizeTerminalShortcutPolicy } from '../../shared/keybindings'
import { normalizeTerminalCursorStyleDefault } from '../../shared/terminal-cursor-style-settings'
import { normalizeTerminalCustomThemes } from '../../shared/terminal-custom-themes'
import { normalizeTerminalLineHeight } from '../../shared/terminal-line-height-settings'
import { normalizeTerminalQuickCommands } from '../../shared/terminal-quick-commands'
import {
  legacyTerminalScrollbackBytesToRows,
  normalizeDesktopTerminalScrollbackRows
} from '../../shared/terminal-scrollback-policy'
import type { GlobalSettings } from '../../shared/types'

type LegacyTerminalSettings = Partial<GlobalSettings> & {
  terminalScrollbackBytes?: unknown
}

export type PersistedTerminalSettingsDecodeResult = {
  settings: Partial<GlobalSettings>
  needsSave: boolean
}

const LEGACY_TERMINAL_TUI_SCROLL_SENSITIVITY_DEFAULT = 3
const LEGACY_TERMINAL_DIVIDER_THICKNESS_DEFAULT = 3

function decodeScrollbackRows(settings: LegacyTerminalSettings): {
  rows: number
  needsSave: boolean
} {
  const hasRows = Object.hasOwn(settings, 'terminalScrollbackRows')
  const hasLegacyBytes = Object.hasOwn(settings, 'terminalScrollbackBytes')
  const rows = hasRows
    ? normalizeDesktopTerminalScrollbackRows(settings.terminalScrollbackRows)
    : legacyTerminalScrollbackBytesToRows(settings.terminalScrollbackBytes)
  return {
    rows,
    needsSave: !hasRows || hasLegacyBytes || settings.terminalScrollbackRows !== rows
  }
}

function decodeTuiScrollSensitivity(settings: LegacyTerminalSettings): {
  value: number
  needsSave: boolean
} {
  const migrated = settings.terminalTuiScrollSensitivityDefaultedToOne === true
  const current = settings.terminalTuiScrollSensitivity
  return {
    value:
      !migrated &&
      (current === undefined || current === LEGACY_TERMINAL_TUI_SCROLL_SENSITIVITY_DEFAULT)
        ? 1
        : (current ?? 1),
    needsSave: !migrated || current === undefined
  }
}

function decodeDividerThickness(
  settings: LegacyTerminalSettings,
  defaults: GlobalSettings
): { value: number; needsSave: boolean } {
  const migrated = settings.terminalDividerThicknessDefaultedToHairline === true
  const current = settings.terminalDividerThicknessPx
  return {
    // Why: migrate the old 3px default while preserving non-default custom widths.
    value:
      !migrated && (current === undefined || current === LEGACY_TERMINAL_DIVIDER_THICKNESS_DEFAULT)
        ? defaults.terminalDividerThicknessPx
        : (current ?? defaults.terminalDividerThicknessPx),
    needsSave: !migrated || current === undefined
  }
}

export function decodePersistedTerminalSettings(
  value: Partial<GlobalSettings> | undefined,
  defaults: GlobalSettings,
  platform: NodeJS.Platform
): PersistedTerminalSettingsDecodeResult {
  const settings = (value ?? {}) as LegacyTerminalSettings
  const typographyMigrated = settings.systemTypographyDefaultsMigrated === true
  const optionAsAltMigrated = settings.terminalMacOptionAsAltMigrated === true
  const rightClickDefaulted = settings.terminalRightClickToPasteDefaultedForPlatform === true
  const scrollback = decodeScrollbackRows(settings)
  const tuiScrollSensitivity = decodeTuiScrollSensitivity(settings)
  const dividerThickness = decodeDividerThickness(settings, defaults)
  const terminalLineHeight = normalizeTerminalLineHeight(settings.terminalLineHeight)
  const primarySelectionDefaultedForLinux =
    settings.primarySelectionMiddleClickPasteDefaultedForLinux === true
  const primarySelectionDefaultedForTerminalDefaults =
    settings.primarySelectionMiddleClickPasteDefaultedForTerminalDefaults === true
  const platformDefaultEnabled = defaults.primarySelectionMiddleClickPaste === true
  const alreadyDefaultedForPlatform =
    primarySelectionDefaultedForTerminalDefaults ||
    (platform === 'linux' && primarySelectionDefaultedForLinux)
  const migratePrimarySelection = platformDefaultEnabled && !alreadyDefaultedForPlatform
  const stampPrimarySelectionDefaults =
    platformDefaultEnabled && !primarySelectionDefaultedForTerminalDefaults

  return {
    settings: {
      ...normalizeTerminalCursorStyleDefault(settings),
      terminalLineHeight,
      terminalRightClickToPaste: rightClickDefaulted
        ? (settings.terminalRightClickToPaste ?? defaults.terminalRightClickToPaste)
        : settings.terminalRightClickToPaste === false
          ? false
          : defaults.terminalRightClickToPaste,
      terminalRightClickToPasteDefaultedForPlatform: true,
      terminalTuiScrollSensitivity: tuiScrollSensitivity.value,
      terminalTuiScrollSensitivityDefaultedToOne: true,
      terminalDividerThicknessPx: dividerThickness.value,
      terminalDividerThicknessDefaultedToHairline: true,
      terminalMacOptionAsAlt: optionAsAltMigrated
        ? (settings.terminalMacOptionAsAlt ?? 'auto')
        : settings.terminalMacOptionAsAlt === undefined ||
            settings.terminalMacOptionAsAlt === 'true'
          ? 'auto'
          : settings.terminalMacOptionAsAlt,
      terminalMacOptionAsAltMigrated: true,
      terminalScrollbackRows: scrollback.rows,
      terminalQuickCommands: normalizeTerminalQuickCommands(settings.terminalQuickCommands),
      terminalCustomThemes: normalizeTerminalCustomThemes(settings.terminalCustomThemes),
      terminalShortcutPolicy: normalizeTerminalShortcutPolicy(settings.terminalShortcutPolicy),
      appFontFamily: typographyMigrated
        ? (settings.appFontFamily ?? defaults.appFontFamily)
        : settings.appFontFamily === undefined || settings.appFontFamily === 'Geist'
          ? defaults.appFontFamily
          : settings.appFontFamily,
      terminalFontSize: typographyMigrated
        ? (settings.terminalFontSize ?? defaults.terminalFontSize)
        : settings.terminalFontSize === undefined || settings.terminalFontSize === 14
          ? defaults.terminalFontSize
          : settings.terminalFontSize,
      systemTypographyDefaultsMigrated: true,
      primarySelectionMiddleClickPaste: migratePrimarySelection
        ? true
        : (settings.primarySelectionMiddleClickPaste ?? defaults.primarySelectionMiddleClickPaste),
      primarySelectionMiddleClickPasteDefaultedForLinux:
        primarySelectionDefaultedForLinux || (platform === 'linux' && migratePrimarySelection),
      primarySelectionMiddleClickPasteDefaultedForTerminalDefaults:
        primarySelectionDefaultedForTerminalDefaults || stampPrimarySelectionDefaults
    },
    needsSave:
      !typographyMigrated ||
      !optionAsAltMigrated ||
      !rightClickDefaulted ||
      scrollback.needsSave ||
      tuiScrollSensitivity.needsSave ||
      dividerThickness.needsSave ||
      (settings.terminalLineHeight !== undefined &&
        settings.terminalLineHeight !== terminalLineHeight) ||
      migratePrimarySelection ||
      stampPrimarySelectionDefaults
  }
}
