import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { useMobileGlassAvailable } from '../components/glass/availability'
import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassSurface } from '../components/glass/surface'
import { ArrowUp, Plus } from '../components/uniwind-icons'

export function MobileUiLabGlassCatalog(): React.JSX.Element {
  const primaryValue = useCSSVariable('--color-primary')
  const primary = typeof primaryValue === 'string' ? primaryValue : undefined
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
          <MobileGlassSurface className="h-11 w-11 overflow-hidden rounded-full" isInteractive>
            <Pressable
              accessibilityLabel="Preview secondary glass action"
              className="active:bg-accent h-11 w-11 items-center justify-center rounded-full"
              onPress={() => setPreviewPresses((count) => count + 1)}
            >
              <Plus size={18} colorClassName="accent-foreground" />
            </Pressable>
          </MobileGlassSurface>
          <MobileGlassSurface
            className="h-11 w-11 overflow-hidden rounded-full"
            isInteractive
            tintColor={primary}
          >
            <Pressable
              accessibilityLabel="Preview prominent glass action"
              className="h-11 w-11 items-center justify-center rounded-full"
              onPress={() => setPreviewPresses((count) => count + 1)}
            >
              <ArrowUp size={18} colorClassName="accent-primary-foreground" />
            </Pressable>
          </MobileGlassSurface>
        </MobileGlassGroup>
      </View>
      <MobileGlassSurface className="mt-2 overflow-hidden rounded-2xl px-3 py-2.5" forceFallback>
        <Text className="text-foreground text-xs font-semibold">Opaque fallback preview</Text>
      </MobileGlassSurface>
    </View>
  )
}
