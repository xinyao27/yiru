import { useMemo } from 'react'
import { useUniwind } from 'uniwind'

import { useThemeColors } from '../theme/uniwind-theme-values'
import type { MobileTerminalTheme } from './terminal-webview-contract'

// Why: xterm cannot consume Uniwind classes, so theme changes are translated
// into the runtime message shape without reloading the terminal document.
export function useTerminalWebViewTheme(terminalTheme?: MobileTerminalTheme) {
  const colors = useThemeColors()
  const { theme } = useUniwind()
  const effectiveTerminalTheme = useMemo(
    () => ({
      mode: terminalTheme?.mode ?? (theme === 'light' ? 'light' : 'dark'),
      theme: {
        background: colors.terminalBg,
        cursorAccent: colors.terminalBg,
        ...terminalTheme?.theme
      }
    }),
    [colors.terminalBg, terminalTheme, theme]
  )
  return effectiveTerminalTheme
}
