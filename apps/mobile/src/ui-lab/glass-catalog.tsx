import { useState } from 'react'
import { Text, View } from 'react-native'

import { useMobileGlassAvailable } from '../components/glass/availability'
import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { MobileGlassSurface } from '../components/glass/surface'
import { translate } from '../i18n/translate'
import { MobileUiLabNativeControlCatalog } from './native-control-catalog'

export function MobileUiLabGlassCatalog(): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const [previewPresses, setPreviewPresses] = useState(0)

  return (
    <View className="mt-5">
      <Text className="text-foreground text-sm font-semibold">
        {translate('mobile.uiLab.glass.title', 'Glass control layer')}
      </Text>
      <Text className="text-muted-foreground mt-1 text-xs leading-5">
        {translate(
          'mobile.uiLab.glass.description',
          'Native material on iOS 26; the same geometry uses opaque semantic surfaces elsewhere.'
        )}
      </Text>
      <Text className="text-muted-foreground mt-1 text-xs font-semibold">
        {isGlassAvailable
          ? translate('mobile.uiLab.glass.nativeActive', 'Native effect active')
          : translate('mobile.uiLab.glass.fallbackActive', 'Opaque fallback active')}
      </Text>
      <View className="border-border bg-secondary relative mt-3 min-h-36 overflow-hidden rounded-3xl border p-4">
        <View className="gap-2">
          <View className="bg-foreground h-5 w-32" />
          <View className="bg-muted h-4 w-48" />
          <View className="bg-muted h-4 w-40" />
          <Text className="text-muted-foreground text-xs">
            {translate('mobile.uiLab.glass.previewTaps', '{{count}} preview taps', {
              count: previewPresses
            })}
          </Text>
        </View>
        <MobileGlassGroup className="absolute right-3 bottom-3 flex-row gap-2" spacing={8}>
          <MobileGlassIconButton
            accessibilityLabel={translate(
              'mobile.uiLab.glass.secondaryAction.label',
              'Preview secondary glass action'
            )}
            icon="plus"
            onPress={() => setPreviewPresses((count) => count + 1)}
            size="large"
          />
          <MobileGlassIconButton
            accessibilityLabel={translate(
              'mobile.uiLab.glass.prominentAction.label',
              'Preview prominent glass action'
            )}
            icon="send"
            isSelected
            onPress={() => setPreviewPresses((count) => count + 1)}
            size="large"
          />
        </MobileGlassGroup>
      </View>
      <MobileGlassSurface
        className="mt-2 overflow-hidden rounded-2xl px-3 py-3"
        forceFallback
        isFunctional
      >
        <Text className="text-foreground text-xs font-semibold">
          {translate('mobile.uiLab.glass.fallbackPreview', 'Opaque fallback preview')}
        </Text>
      </MobileGlassSurface>
      <MobileUiLabNativeControlCatalog />
    </View>
  )
}
