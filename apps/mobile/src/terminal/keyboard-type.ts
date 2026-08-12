export type TerminalKeyboardPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos'
export type TerminalKeyboardType = 'default'

// Why: default keyboards keep non-Latin IMEs selectable; ASCII-only keyboards hide them.
export function getTerminalLiveInputKeyboardType(
  _platform: TerminalKeyboardPlatform
): TerminalKeyboardType {
  return 'default'
}
