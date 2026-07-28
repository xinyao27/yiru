import cursorDarkThemeJson from './cursor-dark-color-theme.json'
import cursorLightThemeJson from './cursor-light-color-theme.json'

export const CURSOR_DARK_THEME_NAME = 'cursor-dark'
export const CURSOR_LIGHT_THEME_NAME = 'cursor-light'

type CursorTokenColor = {
  scope?: string | string[]
  settings: {
    foreground?: string
    background?: string
    fontStyle?: string
  }
}

export type CursorThemeSource = {
  name: string
  colors: Record<string, string>
  tokenColors: CursorTokenColor[]
  semanticHighlighting?: boolean
  semanticTokenColors?: Record<string, string | { foreground?: string; fontStyle?: string }>
}

// Why: these are the unmodified default themes bundled with Cursor 3.12.17;
// keeping them here gives every client one canonical syntax palette.
export const cursorDarkThemeSource: CursorThemeSource = cursorDarkThemeJson
export const cursorLightThemeSource: CursorThemeSource = cursorLightThemeJson

export function resolveCursorThemeName(isDark: boolean): string {
  return isDark ? CURSOR_DARK_THEME_NAME : CURSOR_LIGHT_THEME_NAME
}
