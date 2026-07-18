import { describe, expect, it, vi } from 'vite-plus/test'
import type { editor } from 'monaco-editor'
import { registerCursorMonacoThemes } from './cursor-monaco-theme'
import { CURSOR_DARK_THEME_NAME, CURSOR_LIGHT_THEME_NAME } from './cursor-theme-source'

describe('Cursor Monaco themes', () => {
  it('registers both bundled themes with Cursor editor and diff colors', () => {
    const themes = new Map<string, editor.IStandaloneThemeData>()
    const defineTheme = vi.fn((name: string, theme: editor.IStandaloneThemeData) => {
      themes.set(name, theme)
    })

    registerCursorMonacoThemes({ defineTheme })

    expect([...themes.keys()]).toEqual([CURSOR_DARK_THEME_NAME, CURSOR_LIGHT_THEME_NAME])
    expect(themes.get(CURSOR_DARK_THEME_NAME)?.colors).toMatchObject({
      'editor.background': '#181818',
      'diffEditor.insertedLineBackground': '#3FA26633',
      'diffEditor.removedTextBackground': '#B8004922'
    })
    expect(themes.get(CURSOR_LIGHT_THEME_NAME)?.colors).toMatchObject({
      'editor.background': '#FCFCFC',
      'diffEditor.insertedTextBackground': '#00B06838',
      'diffEditor.removedLineBackground': '#FF617B38'
    })
    expect(themes.get(CURSOR_DARK_THEME_NAME)?.rules).toContainEqual({
      token: 'number',
      foreground: '#ebc88d'
    })
  })
})
