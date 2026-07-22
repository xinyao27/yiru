import { useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'

import { Code, Eye } from '@/components/uniwind-icons'
import { UniwindWebView } from '@/components/uniwind-web-view'
import { cn } from '@/style/class-names'

type Props = {
  html: string
  // Rendered when the user flips to "Source" (the existing syntax view).
  renderSource: () => React.ReactNode
}

// Renders an agent-produced HTML artifact in a sandboxed WebView, with a
// Preview/Source toggle. Navigation is locked: only the initial inline document
// loads in-place; any link tap opens externally so a page can't hijack the
// review surface.
export function MobileHtmlPreview({ html, renderSource }: Props) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview')

  return (
    <View className={styles.container}>
      <View className={styles.toolbar}>
        <Pressable
          className={cn(styles.toggle, mode === 'preview' && styles.toggleActive)}
          onPress={() => setMode('preview')}
          accessibilityLabel="Preview rendered HTML"
        >
          <Eye size={13} colorClassName="accent-muted-foreground" />
          <Text className={styles.toggleText}>Preview</Text>
        </Pressable>
        <Pressable
          className={cn(styles.toggle, mode === 'source' && styles.toggleActive)}
          onPress={() => setMode('source')}
          accessibilityLabel="View HTML source"
        >
          <Code size={13} colorClassName="accent-muted-foreground" />
          <Text className={styles.toggleText}>Source</Text>
        </Pressable>
      </View>
      {mode === 'preview' ? (
        <UniwindWebView
          className={styles.webview}
          originWhitelist={['*']}
          source={{ html }}
          javaScriptEnabled
          // Why: only the initial about:blank inline-HTML load is allowed in
          // place; a tapped link opens in the system browser instead of
          // navigating the review WebView away from the artifact.
          onShouldStartLoadWithRequest={(request) => {
            if (request.url === 'about:blank' || request.url.startsWith('data:')) {
              return true
            }
            void Linking.openURL(request.url).catch(() => {})
            return false
          }}
        />
      ) : (
        renderSource()
      )}
    </View>
  )
}

const styles = {
  container: cn('flex-1'),
  toolbar: cn('flex-row gap-2 px-3 py-2 border-b border-b-border'),
  toggle: cn('flex-row items-center gap-[5px] px-2 py-1 rounded-none bg-secondary'),
  toggleActive: cn('bg-card border border-border'),
  toggleText: cn('text-muted-foreground text-[12px]'),
  webview: cn('flex-1 bg-white')
} as const
