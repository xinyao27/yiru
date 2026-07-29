import type { HighlighterCore, ThemedToken } from '@shikijs/core'
import { TurboModuleRegistry, type TurboModule } from 'react-native'

import { MOBILE_NATIVE_CHAT_CODE_THEMES, type MobileNativeChatCodeTheme } from './code-theme'

export type { MobileNativeChatCodeTheme } from './code-theme'

export type MobileNativeChatCodeToken = {
  color?: string
  content: string
  fontStyle?: number
}

export type MobileNativeChatCodeLine = {
  tokens: readonly MobileNativeChatCodeToken[]
}

const LANGUAGE_ALIASES = new Map<string, string>([
  ['bash', 'shellscript'],
  ['cjs', 'javascript'],
  ['htm', 'html'],
  ['js', 'javascript'],
  ['jsx', 'javascript'],
  ['md', 'markdown'],
  ['mjs', 'javascript'],
  ['mts', 'typescript'],
  ['py', 'python'],
  ['sh', 'shellscript'],
  ['shell', 'shellscript'],
  ['ts', 'typescript'],
  ['yml', 'yaml'],
  ['zsh', 'shellscript']
])

let highlighterPromise: Promise<HighlighterCore> | null = null

export function plainMobileNativeChatCodeLines(code: string): readonly MobileNativeChatCodeLine[] {
  return code.split('\n').map((line) => ({ tokens: [{ content: line }] }))
}

export async function highlightMobileNativeChatCode(
  code: string,
  language: string | null,
  theme: MobileNativeChatCodeTheme
): Promise<readonly MobileNativeChatCodeLine[]> {
  try {
    const highlighter = await getCodeHighlighter()
    return highlighter
      .codeToTokensBase(code, { lang: normalizeLanguage(language), theme })
      .map(toHighlightLine)
  } catch {
    return plainMobileNativeChatCodeLines(code)
  }
}

function getCodeHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createCodeHighlighter()
  return highlighterPromise
}

async function createCodeHighlighter(): Promise<HighlighterCore> {
  if (!TurboModuleRegistry.get<TurboModule>('ShikiEngine')) {
    throw new Error('ShikiEngine is unavailable in this native build')
  }
  const [
    { createHighlighterCore },
    { createNativeEngine },
    css,
    diff,
    html,
    javascript,
    json,
    markdown,
    python,
    shell,
    sql,
    tsx,
    typescript,
    yaml
  ] = await Promise.all([
    import('@shikijs/core'),
    import('react-native-shiki-engine'),
    import('@shikijs/langs/css'),
    import('@shikijs/langs/diff'),
    import('@shikijs/langs/html'),
    import('@shikijs/langs/javascript'),
    import('@shikijs/langs/json'),
    import('@shikijs/langs/markdown'),
    import('@shikijs/langs/python'),
    import('@shikijs/langs/shellscript'),
    import('@shikijs/langs/sql'),
    import('@shikijs/langs/tsx'),
    import('@shikijs/langs/typescript'),
    import('@shikijs/langs/yaml')
  ])
  return createHighlighterCore({
    engine: createNativeEngine({ maxCacheSize: 1000 }),
    langs: [
      css,
      diff,
      html,
      javascript,
      json,
      markdown,
      python,
      shell,
      sql,
      tsx,
      typescript,
      yaml
    ].map((module) => module.default),
    themes: MOBILE_NATIVE_CHAT_CODE_THEMES
  })
}

function normalizeLanguage(language: string | null): string {
  if (!language) {
    return 'text'
  }
  const normalized = language.toLowerCase()
  return LANGUAGE_ALIASES.get(normalized) ?? normalized
}

function toHighlightLine(tokens: ThemedToken[]): MobileNativeChatCodeLine {
  return {
    tokens: tokens.map((token) => ({
      color: token.color,
      content: token.content,
      fontStyle: token.fontStyle
    }))
  }
}
