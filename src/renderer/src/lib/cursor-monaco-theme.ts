import type * as Monaco from 'monaco-editor'
import {
  CURSOR_DARK_THEME_NAME,
  CURSOR_LIGHT_THEME_NAME,
  cursorDarkThemeSource,
  cursorLightThemeSource,
  type CursorThemeSource
} from './cursor-theme-source'

type MonacoThemeRegistrar = Pick<typeof Monaco.editor, 'defineTheme'>

const MONACO_SCOPE_ALIASES = [
  { token: 'number', sourceScope: 'constant.numeric' },
  { token: 'regexp', sourceScope: 'string.regexp' },
  { token: 'type', sourceScope: 'entity.name.type' },
  { token: 'type.identifier', sourceScope: 'entity.name.type' },
  { token: 'attribute.name', sourceScope: 'entity.other.attribute-name' },
  { token: 'tag', sourceScope: 'entity.name.tag.html' },
  { token: 'delimiter', sourceScope: 'punctuation.separator.delimiter' }
]

// Why: Monaco matches one token scope while Cursor includes TextMate parent
// selectors; Yiru's tokenizer emits the final, most-specific scope only.
function getMonacoTokenScopes(scope: string | string[] | undefined): string[] {
  const scopes = Array.isArray(scope) ? scope : scope ? [scope] : []
  return scopes.flatMap((value) =>
    value
      .split(',')
      .map(
        (selector) =>
          selector
            .trim()
            .split(/\s+(?:>\s*)?/u)
            .at(-1) ?? ''
      )
      .filter(Boolean)
  )
}

function createMonacoTheme(
  source: CursorThemeSource,
  base: Monaco.editor.BuiltinTheme
): Monaco.editor.IStandaloneThemeData {
  const rules = source.tokenColors.flatMap((rule) =>
    getMonacoTokenScopes(rule.scope).map((token) => ({
      token,
      ...rule.settings
    }))
  )
  // Why: Monaco's Monarch tokenizers use a few generic token names that do not
  // occur in VS Code TextMate scopes. Alias them back to Cursor's exact rules.
  const aliases = MONACO_SCOPE_ALIASES.flatMap(({ token, sourceScope }) => {
    const sourceRule = source.tokenColors
      .toReversed()
      .find((rule) => getMonacoTokenScopes(rule.scope).includes(sourceScope))
    return sourceRule ? [{ token, ...sourceRule.settings }] : []
  })

  return {
    base,
    // Why: inheriting VS colors would leak its syntax palette into scopes that
    // Cursor intentionally leaves at editor.foreground.
    inherit: false,
    rules: [...aliases, ...rules],
    colors: source.colors
  }
}

export function registerCursorMonacoThemes(editor: MonacoThemeRegistrar): void {
  editor.defineTheme(CURSOR_DARK_THEME_NAME, createMonacoTheme(cursorDarkThemeSource, 'vs-dark'))
  editor.defineTheme(CURSOR_LIGHT_THEME_NAME, createMonacoTheme(cursorLightThemeSource, 'vs'))
}
