import { useMemo } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { resolveCssString } from '../../style/resolve-css-variable'
import type { MobileTerminalTheme } from './contract'

// Why: xterm cannot consume Uniwind classes, so theme changes are translated
// into the runtime message shape without reloading the terminal document.
export function useTerminalWebViewTheme(terminalTheme?: MobileTerminalTheme) {
  const { theme } = useUniwind()
  const [backgroundValue, foregroundValue] = useCSSVariable([
    '--color-terminal-surface',
    '--color-foreground'
  ])
  const terminalBackground = resolveCssString(backgroundValue)
  const terminalForeground = resolveCssString(foregroundValue)
  const effectiveTerminalTheme = useMemo(
    () => ({
      mode: terminalTheme?.mode ?? (theme === 'light' ? 'light' : 'dark'),
      theme: {
        ...terminalTheme?.theme,
        foreground: terminalForeground,
        cursor: terminalForeground,
        background: terminalBackground,
        cursorAccent: terminalBackground
      }
    }),
    [terminalBackground, terminalForeground, terminalTheme, theme]
  )
  return effectiveTerminalTheme
}
