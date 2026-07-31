import { useEffect, useMemo, useState } from 'react'
import { Text, type TextStyle, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { useCSSVariable, useUniwind, withUniwind } from 'uniwind'

import { resolveCssNumber, resolveCssString } from '~/style/resolve-css-variable'

import {
  highlightMobileNativeChatCode,
  plainMobileNativeChatCodeLines,
  type MobileNativeChatCodeToken
} from './code-highlighter'
import { mobileNativeChatCodeTheme } from './code-theme'
import { withOccurrenceKeys } from './occurrence-keys'

const CODE_HIGHLIGHT_FALLBACK_DELAY_MS = 600
const CODE_HIGHLIGHT_IDLE_TIMEOUT_MS = 1500
const FONT_STYLE_ITALIC = 1
const FONT_STYLE_BOLD = 2
const FONT_STYLE_UNDERLINE = 4
const UniwindScrollView = withUniwind(ScrollView)

type MobileNativeChatCodeBlockProps = {
  code: string
  language: string | null
}

export function MobileNativeChatCodeBlock({
  code,
  language
}: MobileNativeChatCodeBlockProps): React.JSX.Element {
  const [lines, setLines] = useState(() => plainMobileNativeChatCodeLines(code))
  const { theme } = useUniwind()
  const values = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground',
    '--text-xs',
    '--text-xs--line-height'
  ])
  const foreground = resolveCssString(values[0])
  const mutedForeground = resolveCssString(values[1])
  const fontSize = resolveCssNumber(values[2])
  const lineHeight = resolveCssNumber(values[3])
  const codeTheme = mobileNativeChatCodeTheme(theme === 'dark')
  const keyedLines = withOccurrenceKeys(lines, (line) =>
    line.tokens
      .map((token) => `${token.content}:${token.color ?? ''}:${token.fontStyle ?? ''}`)
      .join('|')
  )
  const codeTextStyle = useMemo<TextStyle>(
    () => ({
      color: foreground,
      fontSize,
      includeFontPadding: false,
      lineHeight
    }),
    [fontSize, foreground, lineHeight]
  )

  useEffect(() => {
    setLines(plainMobileNativeChatCodeLines(code))
    let cancelled = false
    const cancelHighlight = scheduleCodeHighlight(() => {
      void highlightMobileNativeChatCode(code, language, codeTheme).then((highlightedLines) => {
        if (!cancelled) {
          setLines(highlightedLines)
        }
      })
    })
    return () => {
      cancelled = true
      cancelHighlight()
    }
  }, [code, codeTheme, language])

  return (
    <View className="border-hairline border-border bg-secondary max-w-full min-w-0 overflow-hidden rounded-xl p-2">
      {language ? (
        <Text
          className="h-6 min-w-0 font-mono text-xs lowercase"
          numberOfLines={1}
          style={{ color: mutedForeground }}
        >
          {language}
        </Text>
      ) : null}
      <UniwindScrollView
        className="max-w-full grow-0"
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={{ height: Math.max(1, keyedLines.length) * lineHeight }}
      >
        <Text className="font-mono" style={codeTextStyle}>
          {keyedLines.map(({ key, value: line }, lineIndex) => {
            const keyedTokens = withOccurrenceKeys(
              line.tokens,
              (token) => `${token.content}:${token.color ?? ''}:${token.fontStyle ?? ''}`
            )
            return (
              <Text key={key}>
                {keyedTokens.map(({ key: tokenKey, value: token }) => (
                  <Text key={tokenKey} style={createTokenTextStyle(token)}>
                    {token.content}
                  </Text>
                ))}
                {lineIndex < keyedLines.length - 1 ? '\n' : null}
              </Text>
            )
          })}
        </Text>
      </UniwindScrollView>
    </View>
  )
}

function scheduleCodeHighlight(callback: () => void): () => void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(callback, {
      timeout: CODE_HIGHLIGHT_IDLE_TIMEOUT_MS
    })
    return () => globalThis.cancelIdleCallback(id)
  }
  const id = setTimeout(callback, CODE_HIGHLIGHT_FALLBACK_DELAY_MS)
  return () => clearTimeout(id)
}

function createTokenTextStyle(token: MobileNativeChatCodeToken): TextStyle | undefined {
  if (!token.color && token.fontStyle === undefined) {
    return undefined
  }
  return {
    color: token.color,
    fontStyle:
      token.fontStyle !== undefined && (token.fontStyle & FONT_STYLE_ITALIC) !== 0
        ? 'italic'
        : undefined,
    fontWeight:
      token.fontStyle !== undefined && (token.fontStyle & FONT_STYLE_BOLD) !== 0
        ? '600'
        : undefined,
    textDecorationLine:
      token.fontStyle !== undefined && (token.fontStyle & FONT_STYLE_UNDERLINE) !== 0
        ? 'underline'
        : undefined
  }
}
