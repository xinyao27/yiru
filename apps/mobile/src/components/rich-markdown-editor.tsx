import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, View } from 'react-native'
import type WebView from 'react-native-webview'
import type { WebViewMessageEvent } from 'react-native-webview'
import { useCSSVariable, useUniwind } from 'uniwind'

import {
  TextB as Bold,
  CodeSimple as Code2,
  FileCode as FileCode2,
  TextHOne as Heading1,
  TextHTwo as Heading2,
  TextHThree as Heading3,
  Image as ImageIcon,
  TextItalic as Italic,
  Link,
  List,
  ListNumbers as ListOrdered,
  ListChecks as ListTodo,
  Paragraph as Pilcrow,
  Quotes as Quote,
  TextStrikethrough as Strikethrough,
  type Icon
} from '~/components/uniwind-icons'
import { UniwindWebView } from '~/components/uniwind-web-view'
import { translate } from '~/i18n/translate'
import { cn } from '~/style/class-names'
import { resolveCssNumber, resolveCssString } from '~/style/resolve-css-variable'

import { MobileGlassSurface } from './glass/surface'
import {
  buildMobileRichMarkdownEditorHtml,
  escapeInjectedJavaScriptString
} from './rich-markdown-editor-html'
import { normalizeMobileRichMarkdownKeyboardInset } from './rich-markdown-editor-keyboard-inset-script'
import {
  buildMobileRichMarkdownEditorThemeInjection,
  type MobileRichMarkdownEditorTheme
} from './rich-markdown-editor-theme'

const EDITOR_DOCUMENT_ORIGIN = 'https://yiru-mobile-editor.invalid'
const EDITOR_DOCUMENT_URL = `${EDITOR_DOCUMENT_ORIGIN}/rich-markdown-editor`
const EDITOR_ORIGIN_WHITELIST = [EDITOR_DOCUMENT_ORIGIN, 'about:blank']

function normalizeExternalEditorUrl(value: string): string | null {
  const url = value.trim()
  if (!url) {
    return null
  }
  for (let index = 0; index < url.length; index += 1) {
    const code = url.charCodeAt(index)
    if (code <= 32 || code === 127) {
      return null
    }
  }
  if (/^mailto:/i.test(url)) {
    return url
  }
  if (!/^https?:\/\//i.test(url)) {
    return null
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

type RichMarkdownCommand =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'quote'
  | 'inlineCode'
  | 'codeBlock'
  | 'link'
  | 'image'

type Props = {
  content: string
  editable: boolean
  onChange: (content: string) => void
  onKeyboardInsetChange?: (bottom: number) => void
}

type EditorWebViewMessage =
  | { type: 'ready' }
  | { type: 'change'; markdown: string; generation: number }
  | { type: 'openLink'; url: string }
  | { type: 'keyboardInset'; bottom: number }

type ToolbarItem = {
  command: RichMarkdownCommand
  label: string
  icon: Icon
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { command: 'paragraph', label: translate('mobile.editor.toolbar.body', 'Body'), icon: Pilcrow },
  { command: 'heading1', label: translate('mobile.editor.toolbar.heading1', 'H1'), icon: Heading1 },
  { command: 'heading2', label: translate('mobile.editor.toolbar.heading2', 'H2'), icon: Heading2 },
  { command: 'heading3', label: translate('mobile.editor.toolbar.heading3', 'H3'), icon: Heading3 },
  { command: 'bold', label: translate('mobile.editor.toolbar.bold', 'Bold'), icon: Bold },
  { command: 'italic', label: translate('mobile.editor.toolbar.italic', 'Italic'), icon: Italic },
  {
    command: 'strike',
    label: translate('mobile.editor.toolbar.strike', 'Strike'),
    icon: Strikethrough
  },
  {
    command: 'bulletList',
    label: translate('mobile.editor.toolbar.bulletList', 'Bullet list'),
    icon: List
  },
  {
    command: 'orderedList',
    label: translate('mobile.editor.toolbar.numberedList', 'Numbered list'),
    icon: ListOrdered
  },
  {
    command: 'taskList',
    label: translate('mobile.editor.toolbar.checklist', 'Checklist'),
    icon: ListTodo
  },
  { command: 'quote', label: translate('mobile.editor.toolbar.quote', 'Quote'), icon: Quote },
  { command: 'link', label: translate('mobile.editor.toolbar.link', 'Link'), icon: Link },
  { command: 'image', label: translate('mobile.editor.toolbar.image', 'Image'), icon: ImageIcon },
  {
    command: 'inlineCode',
    label: translate('mobile.editor.toolbar.inlineCode', 'Inline code'),
    icon: Code2
  },
  {
    command: 'codeBlock',
    label: translate('mobile.editor.toolbar.codeBlock', 'Code block'),
    icon: FileCode2
  }
]

function MobileRichMarkdownEditorInner({
  content,
  editable,
  onChange,
  onKeyboardInsetChange
}: Props) {
  const { theme } = useUniwind()
  const themeValues = useCSSVariable([
    '--color-background',
    '--color-border',
    '--color-foreground',
    '--color-muted',
    '--color-muted-foreground',
    '--color-primary',
    '--text-base',
    '--text-base--line-height',
    '--text-sm',
    '--font-mono',
    '--radius-sm',
    '--radius-md',
    '--spacing-1',
    '--spacing-2',
    '--spacing-3',
    '--spacing-4'
  ])
  const editorTheme = useMemo<MobileRichMarkdownEditorTheme>(
    () => ({
      background: resolveCssString(themeValues[0]),
      bodyFontSize: resolveCssNumber(themeValues[6]),
      bodyLineHeight: resolveCssNumber(themeValues[7]),
      border: resolveCssString(themeValues[1]),
      codeFontSize: resolveCssNumber(themeValues[8]),
      colorScheme: theme === 'light' ? 'light' : 'dark',
      foreground: resolveCssString(themeValues[2]),
      monoFamily: resolveCssString(themeValues[9]),
      muted: resolveCssString(themeValues[3]),
      mutedForeground: resolveCssString(themeValues[4]),
      primary: resolveCssString(themeValues[5]),
      radiusMedium: resolveCssNumber(themeValues[11]),
      radiusSmall: resolveCssNumber(themeValues[10]),
      spacing1: resolveCssNumber(themeValues[12]),
      spacing2: resolveCssNumber(themeValues[13]),
      spacing3: resolveCssNumber(themeValues[14]),
      spacing4: resolveCssNumber(themeValues[15])
    }),
    [theme, themeValues]
  )
  const webViewRef = useRef<WebView>(null)
  const readyRef = useRef(false)
  const documentGenerationRef = useRef(0)
  const currentWebViewContentRef = useRef<string | null>(null)
  const [initialHtml] = useState(() => buildMobileRichMarkdownEditorHtml(editorTheme))
  const webViewSource = useMemo(
    () => ({ html: initialHtml, baseUrl: EDITOR_DOCUMENT_URL }),
    [initialHtml]
  )

  const inject = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script}\ntrue;`)
  }, [])

  const applyContent = useCallback(
    (nextContent: string) => {
      documentGenerationRef.current += 1
      currentWebViewContentRef.current = nextContent
      inject(
        `window.__yiruRichMarkdown && window.__yiruRichMarkdown.setMarkdown(${escapeInjectedJavaScriptString(nextContent)}, ${documentGenerationRef.current});`
      )
    },
    [inject]
  )

  const applyEditable = useCallback(
    (nextEditable: boolean) => {
      inject(
        `window.__yiruRichMarkdown && window.__yiruRichMarkdown.setEditable(${nextEditable ? 'true' : 'false'});`
      )
    },
    [inject]
  )

  const applyTheme = useCallback(
    (nextTheme: MobileRichMarkdownEditorTheme) => {
      inject(buildMobileRichMarkdownEditorThemeInjection(nextTheme))
    },
    [inject]
  )

  useEffect(() => {
    if (!readyRef.current) {
      return
    }
    if (currentWebViewContentRef.current !== content) {
      applyContent(content)
    }
  }, [applyContent, content])

  useEffect(() => {
    if (readyRef.current) {
      applyEditable(editable)
    }
  }, [applyEditable, editable])

  useEffect(() => {
    if (readyRef.current) {
      applyTheme(editorTheme)
    }
  }, [applyTheme, editorTheme])

  // Clear any reported keyboard inset when the editor unmounts so a lifted
  // Save/Discard bar settles back once the tab closes.
  useEffect(() => {
    return () => onKeyboardInsetChange?.(0)
  }, [onKeyboardInsetChange])

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: unknown
      try {
        message = JSON.parse(event.nativeEvent.data)
      } catch {
        return
      }
      if (!message || typeof message !== 'object') {
        return
      }
      const editorMessage = message as Partial<EditorWebViewMessage>
      if ('type' in message && message.type === 'ready') {
        readyRef.current = true
        applyTheme(editorTheme)
        applyContent(content)
        applyEditable(editable)
        return
      }
      if (
        editorMessage.type === 'change' &&
        typeof editorMessage.markdown === 'string' &&
        editorMessage.generation === documentGenerationRef.current
      ) {
        currentWebViewContentRef.current = editorMessage.markdown
        onChange(editorMessage.markdown)
        return
      }
      if (editorMessage.type === 'openLink' && typeof editorMessage.url === 'string') {
        const url = normalizeExternalEditorUrl(editorMessage.url)
        if (url) {
          void Linking.openURL(url).catch(() => {})
        }
        return
      }
      if (editorMessage.type === 'keyboardInset' && typeof editorMessage.bottom === 'number') {
        const bottom = normalizeMobileRichMarkdownKeyboardInset(editorMessage.bottom)
        if (bottom !== null) {
          onKeyboardInsetChange?.(bottom)
        }
      }
    },
    [
      applyContent,
      applyEditable,
      applyTheme,
      content,
      editable,
      editorTheme,
      onChange,
      onKeyboardInsetChange
    ]
  )

  const handleShouldStartLoadWithRequest = useCallback((request: { url?: string }) => {
    const url = request.url ?? ''
    const isEditorDocument =
      url === 'about:blank' ||
      url === EDITOR_DOCUMENT_URL ||
      url.startsWith(`${EDITOR_DOCUMENT_URL}#`)
    // Why: editor content is untrusted markdown; links must leave through openLink.
    return isEditorDocument
  }, [])

  const runCommand = useCallback(
    (command: RichMarkdownCommand) => {
      inject(
        `window.__yiruRichMarkdown && window.__yiruRichMarkdown.runCommand(${escapeInjectedJavaScriptString(command)});`
      )
    },
    [inject]
  )

  return (
    <View className="bg-background min-h-0 flex-1">
      <MobileGlassSurface className="min-h-11" isFunctional>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="items-center gap-2 px-2"
          keyboardShouldPersistTaps="handled"
        >
          {TOOLBAR_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <Pressable
                key={item.command}
                disabled={!editable}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => runCommand(item.command)}
                className={cn(
                  'min-h-11 min-w-11 items-center justify-center px-1',
                  editable && 'active:bg-accent',
                  !editable ? 'opacity-60' : null
                )}
              >
                <Icon
                  size={15}
                  colorClassName={editable ? 'accent-foreground' : 'accent-muted-foreground'}
                />
              </Pressable>
            )
          })}
        </ScrollView>
      </MobileGlassSurface>
      <UniwindWebView
        ref={webViewRef}
        source={webViewSource}
        originWhitelist={EDITOR_ORIGIN_WHITELIST}
        javaScriptEnabled
        domStorageEnabled={false}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        className="bg-background min-h-0 flex-1"
        scrollEnabled
        bounces={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        automaticallyAdjustContentInsets={false}
      />
    </View>
  )
}

export const MobileRichMarkdownEditor = memo(MobileRichMarkdownEditorInner)
