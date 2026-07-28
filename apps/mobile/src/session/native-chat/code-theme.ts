import type { ThemeRegistration } from '@shikijs/core'
import {
  CURSOR_DARK_THEME_NAME,
  CURSOR_LIGHT_THEME_NAME,
  cursorDarkThemeSource,
  cursorLightThemeSource,
  type CursorThemeSource
} from '@yiru/editor-themes/cursor'

export type MobileNativeChatCodeTheme =
  | typeof CURSOR_DARK_THEME_NAME
  | typeof CURSOR_LIGHT_THEME_NAME

export const MOBILE_NATIVE_CHAT_CODE_THEMES = [
  createCursorShikiTheme(cursorLightThemeSource, CURSOR_LIGHT_THEME_NAME, 'light'),
  createCursorShikiTheme(cursorDarkThemeSource, CURSOR_DARK_THEME_NAME, 'dark')
]

export function mobileNativeChatCodeTheme(dark: boolean): MobileNativeChatCodeTheme {
  return dark ? CURSOR_DARK_THEME_NAME : CURSOR_LIGHT_THEME_NAME
}

function createCursorShikiTheme(
  source: CursorThemeSource,
  name: MobileNativeChatCodeTheme,
  type: 'dark' | 'light'
): ThemeRegistration {
  const tokenColors = source.tokenColors.map((rule) => {
    const settings = { ...rule.settings }
    delete settings.fontStyle
    return { ...rule, settings }
  })

  // Why: desktop's Pierre adapter also removes font styles so the Cursor
  // palette cannot override the client's typography choices.
  return { colors: source.colors, name, tokenColors, type }
}
