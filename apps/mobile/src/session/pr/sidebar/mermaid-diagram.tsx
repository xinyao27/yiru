import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useCSSVariable, useUniwind } from 'uniwind'

import { UniwindWebView } from '~/components/uniwind-web-view'
import { cn } from '~/style/class-names'
import { resolveCssString } from '~/style/resolve-css-variable'

type Props = {
  codeClassName: string
  source: string
}

// Renders a ```mermaid fence as a diagram via a sandboxed WebView (mermaid has no
// native RN renderer). Mermaid is loaded from a CDN inside the WebView HTML, the
// SVG follows the active app theme, and the WebView posts back its rendered
// height so we can size to content. On any failure (no network, parse error,
// render error) we fall back to the raw source in a labeled mono code box.
export function MermaidDiagram({ codeClassName, source }: Props) {
  const { theme } = useUniwind()
  const values = useCSSVariable([
    '--color-accent',
    '--color-card',
    '--color-foreground',
    '--color-muted-foreground'
  ])
  const diagramTheme = useMemo<MermaidTheme>(
    () => ({
      background: resolveCssString(values[0]),
      card: resolveCssString(values[1]),
      foreground: resolveCssString(values[2]),
      mutedForeground: resolveCssString(values[3])
    }),
    [values]
  )
  const [height, setHeight] = useState(0)
  const [failed, setFailed] = useState(false)
  const colorScheme = theme === 'light' ? 'light' : 'dark'
  const html = useMemo(
    () => buildHtml(source, diagramTheme, colorScheme),
    [colorScheme, diagramTheme, source]
  )

  if (failed) {
    return <MermaidFallback codeClassName={codeClassName} source={source} />
  }

  return (
    <View className={styles.frame}>
      <View className={styles.label}>
        <Text className={styles.labelText}>mermaid</Text>
      </View>
      <UniwindWebView
        className="bg-secondary"
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

function MermaidFallback({ codeClassName, source }: Props) {
  return (
    <View className={styles.frame}>
      <View className={styles.label}>
        <Text className={styles.labelText}>mermaid</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="p-2">
        <Text className={cn('text-foreground font-mono', codeClassName)}>{source}</Text>
      </ScrollView>
    </View>
  )
}

// Self-contained HTML: load mermaid from CDN, render the graph, post the body
// height (or "error") back to RN. Theme variables follow the active app palette.
type MermaidTheme = {
  background: string
  card: string
  foreground: string
  mutedForeground: string
}

function buildHtml(source: string, theme: MermaidTheme, colorScheme: 'light' | 'dark'): string {
  // JSON.stringify safely escapes the user's diagram source for embedding.
  const encoded = JSON.stringify(source)
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; background: ${theme.background}; }
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
        background: '${theme.background}',
        primaryColor: '${theme.card}',
        primaryTextColor: '${theme.foreground}',
        lineColor: '${theme.mutedForeground}',
        textColor: '${theme.foreground}'
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
  frame: cn('border-hairline border-border mb-2 overflow-hidden rounded-xl bg-secondary'),
  label: cn('px-2 py-1 border-b-hairline border-b-border bg-card'),
  labelText: cn('text-muted-foreground text-xs font-mono')
} as const
