import { translate } from '~/i18n/translate'

import {
  TERMINAL_SHORTCUT_SPECIAL_KEYS,
  type TerminalShortcutModifier,
  type TerminalShortcutSpecialKey
} from '../terminal/accessory-keys'

function translateShortcut(key: string, fallback: string): string {
  return translate(`mobile.terminalShortcut.${key}`, fallback)
}

export const CUSTOM_KEY_STEP_TITLES = {
  'choose-type': translateShortcut('addShortcutTitle', 'Add Shortcut'),
  'shortcut-combo': translateShortcut('shortcutComboTitle', 'Shortcut Combo'),
  'special-keys': translateShortcut('pickKeyTitle', 'Pick a key'),
  'text-macro': translateShortcut('textMacroTitle', 'Text Macro')
} as const

export const CUSTOM_KEY_COPY = {
  back: translate('mobile.common.back', 'Back'),
  add: translate('mobile.common.add', 'Add'),
  shortcutComboDescription: translateShortcut(
    'shortcutComboDescription',
    'Build Ctrl, Alt, and Shift key chords'
  ),
  textMacroDescription: translateShortcut('textMacroDescription', 'Send custom text command'),
  manageShortcuts: translateShortcut('manageShortcuts', 'Manage Shortcuts'),
  manageShortcutsDescription: translateShortcut(
    'manageShortcutsDescription',
    'Show, hide, or reorder shortcut keys'
  ),
  modifiers: translateShortcut('modifiersLabel', 'Modifiers'),
  key: translateShortcut('keyLabel', 'Key'),
  shortcutKeyExample: translateShortcut('shortcutKeyExample', 'C'),
  moreKeys: translateShortcut('moreKeys', 'More keys — Tab, arrows, F1–F12…'),
  macroLabel: translateShortcut('macroLabel', 'Label'),
  macroLabelExample: translateShortcut('macroLabelExample', 'e.g. Build'),
  command: translateShortcut('commandLabel', 'Command'),
  commandExample: translateShortcut('commandExample', 'e.g. pnpm build'),
  pressEnter: translateShortcut('pressEnter.label', 'Press Enter')
} as const

// Why: Alt is rendered with the ⌥ glyph because on macOS hosts the Option key
// is the only modifier that produces an ESC-prefixed byte sequence terminals
// can read. Cmd is intentionally absent — macOS swallows it before keystrokes
// reach the shell, so there's nothing to encode.
export const CUSTOM_KEY_MODIFIERS: {
  id: TerminalShortcutModifier
  label: string
  glyph?: string
}[] = [
  { id: 'ctrl', label: translateShortcut('modifier.ctrl', 'Ctrl') },
  { id: 'alt', label: translateShortcut('modifier.alt', 'Alt'), glyph: '⌥' },
  { id: 'shift', label: translateShortcut('modifier.shift', 'Shift') }
]

// Why: special keys are grouped by purpose so the picker reads as three small
// fixed grids rather than one ragged wrap row that clipped F7-F12.
export const CUSTOM_KEY_GROUPS: { title: string; ids: string[]; columns: 4 | 6 }[] = [
  {
    title: translateShortcut('specialKeyGroup.editing', 'Editing'),
    ids: ['escape', 'tab', 'enter', 'backspace', 'delete', 'insert', 'space'],
    columns: 4
  },
  {
    title: translateShortcut('specialKeyGroup.navigation', 'Navigation'),
    ids: ['arrowUp', 'arrowDown', 'arrowLeft', 'arrowRight', 'home', 'end', 'pageUp', 'pageDown'],
    columns: 4
  },
  {
    title: translateShortcut('specialKeyGroup.function', 'Function'),
    ids: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'],
    columns: 6
  }
]

export const CUSTOM_KEY_BY_ID: Record<string, TerminalShortcutSpecialKey> = Object.fromEntries(
  TERMINAL_SHORTCUT_SPECIAL_KEYS.map((key) => [key.id, key])
)

export function translatedCustomKeyLabel(key: TerminalShortcutSpecialKey): string {
  return translateShortcut(`specialKey.${key.id}.label`, key.label)
}

export function translatedCustomKeyAccessibilityLabel(key: TerminalShortcutSpecialKey): string {
  return translateShortcut(`specialKey.${key.id}.accessibilityLabel`, key.accessibilityLabel)
}
