import { useMemo } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { resolveCssString } from '../../style/resolve-css-variable'
import type { MobileTerminalTheme } from './contract'

// Why: xterm cannot consume Uniwind classes, so theme changes are translated
// into the runtime message shape without reloading the terminal document.
export function useTerminalWebViewTheme(terminalTheme?: MobileTerminalTheme) {
  const { theme } = useUniwind()
  const terminalBackground = resolveCssString(useCSSVariable('--color-terminal-surface'))
  const effectiveTerminalTheme = useMemo(
    () => ({
      mode: terminalTheme?.mode ?? (theme === 'light' ? 'light' : 'dark'),
      theme: {
        background: terminalBackground,
        cursorAccent: terminalBackground,
        ...terminalTheme?.theme
      }
    }),
    [terminalBackground, terminalTheme, theme]
  )
  return effectiveTerminalTheme
}
