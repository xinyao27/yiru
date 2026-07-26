import { useCallback, useMemo } from 'react'
import { Linking, StyleSheet, Text, type ViewStyle } from 'react-native'
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
  type Md4cFlags
} from 'react-native-enriched-markdown'

import {
  spacing,
  useThemeColors,
  type ThemeColors,
  typography
} from '../theme/uniwind-theme-values'
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

function createMarkdownStyle(colors: ThemeColors, textScale: number): MarkdownStyle {
  const bodySize = 14 * textScale
  const bodyLineHeight = 20 * textScale
  const blockGap = spacing.sm * textScale
  const body = {
    color: colors.textPrimary,
    fontSize: bodySize,
    lineHeight: bodyLineHeight
  }
  const heading = (size: number): NonNullable<MarkdownStyle['h1']> => ({
    color: colors.textPrimary,
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
      borderColor: colors.borderSubtle,
      borderWidth: 2,
      gapWidth: spacing.sm,
      marginBottom: blockGap,
      marginTop: blockGap
    },
    code: {
      backgroundColor: colors.bgPanel,
      borderColor: colors.borderSubtle,
      color: colors.textPrimary,
      fontFamily: typography.monoFamily,
      fontSize: 12 * textScale
    },
    codeBlock: {
      ...body,
      backgroundColor: colors.bgPanel,
      borderColor: colors.borderSubtle,
      borderRadius: 0,
      borderWidth: StyleSheet.hairlineWidth,
      fontFamily: typography.monoFamily,
      fontSize: 12 * textScale,
      lineHeight: 17 * textScale,
      marginBottom: blockGap,
      marginTop: blockGap,
      padding: spacing.sm
    },
    em: { color: colors.textPrimary, fontStyle: 'italic' },
    h1: heading(14),
    h2: heading(14),
    h3: heading(14),
    h4: heading(14),
    h5: heading(14),
    h6: { ...heading(14), color: colors.textSecondary },
    image: { borderRadius: 0, height: 180, marginBottom: blockGap, marginTop: blockGap },
    inlineImage: { size: bodySize },
    link: { color: colors.accentBlue, underline: true },
    linkVariants: {
      '^yiru-file://': { color: colors.accentBlue, underline: true }
    },
    list: {
      ...body,
      bulletColor: colors.textSecondary,
      gapWidth: spacing.sm,
      markerColor: colors.textSecondary,
      markerFontWeight: '600',
      markerMinWidth: 0,
      marginBottom: blockGap,
      marginLeft: spacing.md,
      marginTop: 0
    },
    math: {
      backgroundColor: 'transparent',
      color: colors.textPrimary,
      fontSize: bodySize,
      marginBottom: blockGap,
      marginTop: blockGap
    },
    inlineMath: { color: colors.textPrimary },
    paragraph: { ...body, marginBottom: blockGap, marginTop: 0 },
    strikethrough: { color: colors.textPrimary },
    strong: { color: colors.textPrimary, fontWeight: 'bold' },
    table: {
      ...body,
      borderColor: colors.borderSubtle,
      borderRadius: 0,
      borderWidth: StyleSheet.hairlineWidth,
      cellPaddingHorizontal: spacing.sm,
      cellPaddingVertical: spacing.xs,
      headerBackgroundColor: colors.bgPanel,
      headerTextColor: colors.textPrimary,
      marginBottom: blockGap,
      marginTop: blockGap,
      rowEvenBackgroundColor: colors.bgPanel,
      rowOddBackgroundColor: 'transparent'
    },
    taskList: {
      borderColor: colors.textPrimary,
      checkboxBorderRadius: 0,
      checkboxSize: 16,
      checkedColor: colors.accentBlue,
      checkedStrikethrough: false,
      checkedTextColor: colors.textPrimary,
      checkmarkColor: colors.bgBase
    },
    thematicBreak: {
      color: colors.borderSubtle,
      height: StyleSheet.hairlineWidth,
      marginBottom: blockGap,
      marginTop: blockGap
    },
    underline: { color: colors.textPrimary }
  }
}

export function MobileMarkdown({
  content,
  fallback = '',
  textScale = 1,
  onOpenFile
}: MobileMarkdownProps): React.JSX.Element | null {
  const colors = useThemeColors()
  const text = content?.trim() || fallback
  const markdown = useMemo(() => {
    const normalized = normalizeMobileMarkdownPreviewHtml(text)
    return onOpenFile ? linkifyMarkdownFilePaths(normalized) : normalized
  }, [onOpenFile, text])
  const markdownStyle = useMemo(() => createMarkdownStyle(colors, textScale), [colors, textScale])
  const handleLinkPress = useCallback(
    (event: LinkPressEvent) => openMarkdownUrl(event.url, onOpenFile),
    [onOpenFile]
  )

  if (!text) {
    return null
  }

  if (!markdown) {
    return <Text style={{ color: colors.textPrimary, fontSize: 14 * textScale }}>{text}</Text>
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
