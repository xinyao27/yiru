import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useUniwind } from 'uniwind'

import { UniwindWebView } from '@/components/uniwind-web-view'
import { cn } from '@/style/class-names'

import { type ThemeColors, useThemeColors } from '../../theme/uniwind-theme-values'

type Props = {
  source: string
  base: number
}

// Renders a ```mermaid fence as a diagram via a sandboxed WebView (mermaid has no
// native RN renderer). Mermaid is loaded from a CDN inside the WebView HTML, the
// SVG follows the active app theme, and the WebView posts back its rendered
// height so we can size to content. On any failure (no network, parse error,
// render error) we fall back to the raw source in a labeled mono code box.
export function MermaidDiagram({ source, base }: Props) {
  const colors = useThemeColors()
  const { theme } = useUniwind()
  const [height, setHeight] = useState(0)
  const [failed, setFailed] = useState(false)
  const colorScheme = theme === 'light' ? 'light' : 'dark'
  const html = useMemo(() => buildHtml(source, colors, colorScheme), [colorScheme, colors, source])

  if (failed) {
    return <MermaidFallback source={source} base={base} />
  }

  return (
    <View className={styles.frame}>
      <View className={styles.label}>
        <Text className={styles.labelText}>mermaid</Text>
      </View>
      <UniwindWebView
        className={styles.webview}
        style={[{ height: height || 120 }]}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        scrollEnabled={false}
        // Diagram is self-contained; any navigation attempt means something is
        // wrong, so treat it as a render failure and fall back to source.
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank' || request.url.startsWith('data:')) {
            return true
          }
          setFailed(true)
          return false
        }}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        onMessage={(event) => {
          const data = event.nativeEvent.data
          if (data === 'error') {
            setFailed(true)
            return
          }
          const parsed = Number(data)
          if (Number.isFinite(parsed) && parsed > 0) {
            setHeight(Math.ceil(parsed))
          }
        }}
      />
    </View>
  )
}

function MermaidFallback({ source, base }: Props) {
  return (
    <View className={styles.frame}>
      <View className={styles.label}>
        <Text className={styles.labelText}>mermaid</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className={styles.fallbackScroll}
      >
        <Text className={styles.fallbackText} style={[{ fontSize: base - 1 }]}>
          {source}
        </Text>
      </ScrollView>
    </View>
  )
}

// Self-contained HTML: load mermaid from CDN, render the graph, post the body
// height (or "error") back to RN. Theme variables follow the active app palette.
function buildHtml(source: string, colors: ThemeColors, colorScheme: 'light' | 'dark'): string {
  // JSON.stringify safely escapes the user's diagram source for embedding.
  const encoded = JSON.stringify(source)
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; background: ${colors.bgRaised}; }
  #c { padding: 8px; }
  #c svg { max-width: 100%; height: auto; }
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
</head>
<body>
<div id="c"><pre class="mermaid"></pre></div>
<script>
  function post(msg) {
    if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(String(msg)); }
  }
  function reportHeight() {
    post(document.getElementById('c').scrollHeight);
  }
  try {
    document.querySelector('.mermaid').textContent = ${encoded};
    mermaid.initialize({
      startOnLoad: false,
      theme: '${colorScheme === 'dark' ? 'dark' : 'default'}',
      securityLevel: 'strict',
      darkMode: ${colorScheme === 'dark'},
      themeVariables: {
        background: '${colors.bgRaised}',
        primaryColor: '${colors.bgPanel}',
        primaryTextColor: '${colors.textPrimary}',
        lineColor: '${colors.textSecondary}',
        textColor: '${colors.textPrimary}'
      }
    });
    mermaid.run({ querySelector: '.mermaid' })
      .then(reportHeight)
      .catch(function () { post('error'); });
  } catch (e) {
    post('error');
  }
</script>
</body>
</html>`
}

const styles = {
  frame: cn('border-hairline border-border rounded-none mb-2 overflow-hidden bg-secondary'),
  label: cn('px-2 py-[2px] border-b-hairline border-b-border bg-card'),
  labelText: cn('text-muted-foreground text-[11px] font-mono'),
  webview: cn('bg-secondary'),
  fallbackScroll: cn('p-2'),
  fallbackText: cn('text-foreground font-mono')
} as const
