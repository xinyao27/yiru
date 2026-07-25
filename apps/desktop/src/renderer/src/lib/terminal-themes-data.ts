import type { ITheme } from '@xterm/xterm'

import { CLASSIC_TERMINAL_THEMES } from './terminal-themes/classic'
import { DEFAULT_TERMINAL_THEMES } from './terminal-themes/defaults'
import { POPULAR_DARK_TERMINAL_THEMES } from './terminal-themes/popular-dark'
import { POPULAR_LIGHT_TERMINAL_THEMES } from './terminal-themes/popular-light'
import { mergeTerminalThemeCatalogs } from './terminal-themes/shared'
import type { TerminalThemeMap } from './terminal-themes/types'

const THEME_CATEGORIES: readonly TerminalThemeMap[] = [
  DEFAULT_TERMINAL_THEMES,
  POPULAR_DARK_TERMINAL_THEMES,
  POPULAR_LIGHT_TERMINAL_THEMES,
  CLASSIC_TERMINAL_THEMES
]

export const TERMINAL_THEMES: Record<string, ITheme> = mergeTerminalThemeCatalogs(
  ...THEME_CATEGORIES
)

export function getThemeNames(): string[] {
  return Object.keys(TERMINAL_THEMES).sort()
}

export function getTheme(name: string): ITheme | null {
  return TERMINAL_THEMES[name] ?? null
}
