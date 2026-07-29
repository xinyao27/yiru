import { useState } from 'react'
import { Text, View } from 'react-native'

import { useMobileGlassAvailable } from '../components/glass/availability'
import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { MobileGlassSurface } from '../components/glass/surface'

export function MobileUiLabGlassCatalog(): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const [previewPresses, setPreviewPresses] = useState(0)

  return (
    <View className="mt-5">
      <Text className="text-foreground text-sm font-semibold">Glass control layer</Text>
      <Text className="text-muted-foreground mt-1 text-xs leading-5">
        Native material on iOS 26; the same geometry uses opaque semantic surfaces elsewhere.
      </Text>
      <Text className="text-muted-foreground mt-1 text-xs font-semibold">
        {isGlassAvailable ? 'Native effect active' : 'Opaque fallback active'}
      </Text>
      <View className="border-border bg-secondary relative mt-3 min-h-36 overflow-hidden rounded-3xl border p-4">
        <View className="gap-2">
          <View className="bg-foreground h-5 w-32" />
          <View className="bg-muted h-4 w-48" />
          <View className="bg-muted h-4 w-40" />
          <Text className="text-muted-foreground text-xs">{previewPresses} preview taps</Text>
        </View>
        <MobileGlassGroup className="absolute right-3 bottom-3 flex-row gap-2" spacing={8}>
          <MobileGlassIconButton
            accessibilityLabel="Preview secondary glass action"
            icon="plus"
            onPress={() => setPreviewPresses((count) => count + 1)}
            size="large"
          />
          <MobileGlassIconButton
            accessibilityLabel="Preview prominent glass action"
            icon="send"
            isSelected
            onPress={() => setPreviewPresses((count) => count + 1)}
            size="large"
          />
        </MobileGlassGroup>
      </View>
      <MobileGlassSurface className="mt-2 overflow-hidden rounded-2xl px-3 py-3" forceFallback>
        <Text className="text-foreground text-xs font-semibold">Opaque fallback preview</Text>
      </MobileGlassSurface>
    </View>
  )
}
