import type { SettingsSearchEntry } from '../search'
import {
  getTerminalAdvancedSearchEntries,
  getTerminalGhosttyImportSearchEntries,
  getTerminalMacOptionSearchEntries,
  getTerminalMacYenSearchEntries
} from './advanced-platform-search'
import {
  getTerminalPaneAppearanceSearchEntries,
  getTerminalPaneInteractionSearchEntries
} from './pane-appearance-search'
import {
  getTerminalDarkThemeSearchEntries,
  getTerminalLightThemeSearchEntries,
  getTerminalThemeTargetSearchEntries,
  getTerminalWarpImportSearchEntries,
  getTerminalYamlImportSearchEntries
} from './theme-search'
import {
  getTerminalCursorSearchEntries,
  getTerminalRenderingSearchEntries,
  getTerminalTypographySearchEntries
} from './typography-search'
import {
  getManageSessionsSearchEntries,
  getTerminalSetupScriptSearchEntries,
  getTerminalWindowSearchEntries
} from './window-setup-search'
import {
  getTerminalRightClickToPasteSearchEntry,
  getTerminalWindowsPowershellImplementationSearchEntry,
  getTerminalWindowsShellSearchEntry
} from './windows-search'

export {
  getTerminalAdvancedTypographySearchEntries,
  getTerminalTypographySearchEntries,
  getTerminalRenderingSearchEntries,
  getTerminalCursorSearchEntries
} from './typography-search'
export {
  getTerminalPaneAppearanceSearchEntries,
  getTerminalPaneInteractionSearchEntries
} from './pane-appearance-search'
export {
  getTerminalDarkThemeSearchEntries,
  getTerminalLightThemeSearchEntries,
  getTerminalThemeTargetSearchEntries,
  getTerminalWarpImportSearchEntries,
  getTerminalYamlImportSearchEntries
} from './theme-search'
export {
  getTerminalAdvancedSearchEntries,
  getTerminalMacOptionSearchEntries,
  getTerminalMacYenSearchEntries,
  getTerminalGhosttyImportSearchEntries
} from './advanced-platform-search'
export {
  getManageSessionsSearchEntries,
  getTerminalWindowSearchEntries,
  getTerminalSetupScriptSearchEntries
} from './window-setup-search'

type TerminalAppearanceSearchOptions = {
  showNativeWindowSettings?: boolean
  showWarpImport?: boolean
}

export function getTerminalAppearanceSearchEntries(
  options: TerminalAppearanceSearchOptions = {}
): SettingsSearchEntry[] {
  return [
    ...getTerminalTypographySearchEntries(),
    ...getTerminalCursorSearchEntries(),
    ...getTerminalPaneAppearanceSearchEntries(),
    ...getTerminalThemeTargetSearchEntries(),
    ...getTerminalDarkThemeSearchEntries(),
    ...getTerminalLightThemeSearchEntries(),
    ...getTerminalWindowSearchEntries({
      showNativeWindowSettings: options.showNativeWindowSettings
    }),
    ...getTerminalGhosttyImportSearchEntries(),
    ...((options.showWarpImport ?? true)
      ? [...getTerminalWarpImportSearchEntries(), ...getTerminalYamlImportSearchEntries()]
      : [])
  ]
}

export function getTerminalPaneSearchEntries(platform: {
  isWindows: boolean
  isWindowsTerminalHost?: boolean
  isMac: boolean
}): SettingsSearchEntry[] {
  const isWindowsTerminalHost = platform.isWindowsTerminalHost ?? platform.isWindows
  // Why: the settings search index must mirror the visible controls. Keeping
  // platform-only controls out of other platforms' search results prevents
  // users from landing on an option the UI intentionally hides.
  return [
    ...getTerminalRenderingSearchEntries(),
    ...getTerminalPaneInteractionSearchEntries(),
    ...(isWindowsTerminalHost
      ? [
          ...getTerminalWindowsShellSearchEntry(),
          ...getTerminalWindowsPowershellImplementationSearchEntry()
        ]
      : []),
    ...getTerminalRightClickToPasteSearchEntry(),
    ...getTerminalSetupScriptSearchEntries(),
    ...getManageSessionsSearchEntries(),
    ...getTerminalAdvancedSearchEntries(),
    ...(platform.isMac
      ? [...getTerminalMacOptionSearchEntries(), ...getTerminalMacYenSearchEntries()]
      : [])
  ]
}
