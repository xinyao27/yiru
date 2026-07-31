import { useState } from 'react'
import { Linking, View } from 'react-native'

import { MobileGlassSegmentedControl } from '~/components/glass/segmented-control'
import type { MobileGlassSegmentOption } from '~/components/glass/segmented-control-props'
import { UniwindWebView } from '~/components/uniwind-web-view'

type Props = {
  html: string
  // Rendered when the user flips to "Source" (the existing syntax view).
  renderSource: () => React.ReactNode
}

type MobileHtmlPreviewMode = 'preview' | 'source'

const HTML_PREVIEW_MODES: MobileGlassSegmentOption<MobileHtmlPreviewMode>[] = [
  { label: 'Preview', value: 'preview' },
  { label: 'Source', value: 'source' }
]

// Renders an agent-produced HTML artifact in a sandboxed WebView, with a
// Preview/Source toggle. Navigation is locked: only the initial inline document
// loads in-place; any link tap opens externally so a page can't hijack the
// review surface.
export function MobileHtmlPreview({ html, renderSource }: Props) {
  const [mode, setMode] = useState<MobileHtmlPreviewMode>('preview')

  return (
    <View className="flex-1">
      <View className="mx-3 my-2">
        <MobileGlassSegmentedControl
          accessibilityLabel="HTML view"
          options={HTML_PREVIEW_MODES}
          value={mode}
          onChange={setMode}
        />
      </View>
      {mode === 'preview' ? (
        <UniwindWebView
          className="flex-1 bg-white"
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
