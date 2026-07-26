import { useCallback, useMemo } from 'react'
import { Linking, StyleSheet, Text, type ViewStyle } from 'react-native'
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
  type Md4cFlags
} from 'react-native-enriched-markdown'
import { useCSSVariable } from 'uniwind'

import { resolveCssNumber, resolveCssString } from '../style/resolve-css-variable'
import { filePathFromMarkdownUrl, linkifyMarkdownFilePaths } from './markdown-file-links'
import { normalizeMobileMarkdownPreviewHtml } from './markdown-preview-html'

type MobileMarkdownProps = {
  content?: string
  fallback?: string
  textScale?: number
  onOpenFile?: (relativePath: string) => void
}

const MARKDOWN_CONTAINER_STYLE = {
  maxWidth: '100%',
  minWidth: 0
} satisfies ViewStyle
const MD4C_FLAGS: Md4cFlags = {
  latexMath: true,
  underline: false
}

function openMarkdownUrl(url: string, onOpenFile?: (relativePath: string) => void): void {
  const trimmed = url.trim()
  const filePath = filePathFromMarkdownUrl(trimmed)
  if (onOpenFile && filePath) {
    onOpenFile(filePath)
    return
  }
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
    void Linking.openURL(trimmed).catch(() => undefined)
  }
}

type MarkdownTheme = {
  background: string
  border: string
  card: string
  foreground: string
  mutedForeground: string
  primary: string
  bodySize: number
  bodyLineHeight: number
  codeSize: number
  codeLineHeight: number
  radius: number
  spacing1: number
  spacing2: number
  spacing3: number
  spacing4: number
  monoFamily: string
}

function createMarkdownStyle(theme: MarkdownTheme, textScale: number): MarkdownStyle {
  const bodySize = theme.bodySize * textScale
  const bodyLineHeight = theme.bodyLineHeight * textScale
  const blockGap = theme.spacing2 * textScale
  const body = {
    color: theme.foreground,
    fontSize: bodySize,
    lineHeight: bodyLineHeight
  }
  const heading = (size: number): NonNullable<MarkdownStyle['h1']> => ({
    color: theme.foreground,
    fontSize: size * textScale,
    fontWeight: '700',
    lineHeight: (size + 6) * textScale,
    marginBottom: blockGap,
    marginTop: blockGap
  })

  return {
    blockquote: {
      ...body,
      backgroundColor: 'transparent',
      borderColor: theme.border,
      borderWidth: 2,
      gapWidth: theme.spacing2,
      marginBottom: blockGap,
      marginTop: blockGap
    },
    code: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      color: theme.foreground,
      fontFamily: theme.monoFamily,
      fontSize: theme.codeSize * textScale
    },
    codeBlock: {
      ...body,
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: theme.radius,
      borderWidth: StyleSheet.hairlineWidth,
      fontFamily: theme.monoFamily,
      fontSize: theme.codeSize * textScale,
      lineHeight: theme.codeLineHeight * textScale,
      marginBottom: blockGap,
      marginTop: blockGap,
      padding: theme.spacing2
    },
    em: { color: theme.foreground, fontStyle: 'italic' },
    h1: heading(theme.bodySize),
    h2: heading(theme.bodySize),
    h3: heading(theme.bodySize),
    h4: heading(theme.bodySize),
    h5: heading(theme.bodySize),
    h6: { ...heading(theme.bodySize), color: theme.mutedForeground },
    image: { borderRadius: theme.radius, height: 180, marginBottom: blockGap, marginTop: blockGap },
    inlineImage: { size: bodySize },
    link: { color: theme.primary, underline: true },
    linkVariants: {
      '^yiru-file://': { color: theme.primary, underline: true }
    },
    list: {
      ...body,
      bulletColor: theme.mutedForeground,
      gapWidth: theme.spacing2,
      markerColor: theme.mutedForeground,
      markerFontWeight: '600',
      markerMinWidth: 0,
      marginBottom: blockGap,
      marginLeft: theme.spacing3,
      marginTop: 0
    },
    math: {
      backgroundColor: 'transparent',
      color: theme.foreground,
      fontSize: bodySize,
      marginBottom: blockGap,
      marginTop: blockGap
    },
    inlineMath: { color: theme.foreground },
    paragraph: { ...body, marginBottom: blockGap, marginTop: 0 },
    strikethrough: { color: theme.foreground },
    strong: { color: theme.foreground, fontWeight: 'bold' },
    table: {
      ...body,
      borderColor: theme.border,
      borderRadius: theme.radius,
      borderWidth: StyleSheet.hairlineWidth,
      cellPaddingHorizontal: theme.spacing2,
      cellPaddingVertical: theme.spacing1,
      headerBackgroundColor: theme.card,
      headerTextColor: theme.foreground,
      marginBottom: blockGap,
      marginTop: blockGap,
      rowEvenBackgroundColor: theme.card,
      rowOddBackgroundColor: 'transparent'
    },
    taskList: {
      borderColor: theme.foreground,
      checkboxBorderRadius: 4,
      checkboxSize: theme.spacing4,
      checkedColor: theme.primary,
      checkedStrikethrough: false,
      checkedTextColor: theme.foreground,
      checkmarkColor: theme.background
    },
    thematicBreak: {
      color: theme.border,
      height: StyleSheet.hairlineWidth,
      marginBottom: blockGap,
      marginTop: blockGap
    },
    underline: { color: theme.foreground }
  }
}

export function MobileMarkdown({
  content,
  fallback = '',
  textScale = 1,
  onOpenFile
}: MobileMarkdownProps): React.JSX.Element | null {
  const values = useCSSVariable([
    '--color-background',
    '--color-border',
    '--color-card',
    '--color-foreground',
    '--color-muted-foreground',
    '--color-primary',
    '--text-base',
    '--text-base--line-height',
    '--text-sm',
    '--text-sm--line-height',
    '--radius-md',
    '--spacing-1',
    '--spacing-2',
    '--spacing-3',
    '--spacing-4',
    '--font-mono'
  ])
  const theme = useMemo<MarkdownTheme>(
    () => ({
      background: resolveCssString(values[0]),
      border: resolveCssString(values[1]),
      card: resolveCssString(values[2]),
      foreground: resolveCssString(values[3]),
      mutedForeground: resolveCssString(values[4]),
      primary: resolveCssString(values[5]),
      bodySize: resolveCssNumber(values[6]),
      bodyLineHeight: resolveCssNumber(values[7]),
      codeSize: resolveCssNumber(values[8]),
      codeLineHeight: resolveCssNumber(values[9]),
      radius: resolveCssNumber(values[10]),
      spacing1: resolveCssNumber(values[11]),
      spacing2: resolveCssNumber(values[12]),
      spacing3: resolveCssNumber(values[13]),
      spacing4: resolveCssNumber(values[14]),
      monoFamily: resolveCssString(values[15])
    }),
    [values]
  )
  const text = content?.trim() || fallback
  const markdown = useMemo(() => {
    const normalized = normalizeMobileMarkdownPreviewHtml(text)
    return onOpenFile ? linkifyMarkdownFilePaths(normalized) : normalized
  }, [onOpenFile, text])
  const markdownStyle = useMemo(() => createMarkdownStyle(theme, textScale), [textScale, theme])
  const handleLinkPress = useCallback(
    (event: LinkPressEvent) => openMarkdownUrl(event.url, onOpenFile),
    [onOpenFile]
  )

  if (!text) {
    return null
  }

  if (!markdown) {
    return (
      <Text style={{ color: theme.foreground, fontSize: theme.bodySize * textScale }}>{text}</Text>
    )
  }

  return (
    <EnrichedMarkdownText
      allowTrailingMargin={false}
      containerStyle={MARKDOWN_CONTAINER_STYLE}
      enableLinkPreview={false}
      flavor="github"
      markdown={markdown}
      markdownStyle={markdownStyle}
      md4cFlags={MD4C_FLAGS}
      onLinkPress={handleLinkPress}
      selectable={false}
    />
  )
}
