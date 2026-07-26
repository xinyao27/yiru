import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '@/components/uniwind-icons'

import { LoadingIndicator } from '../src/components/loading-indicator'
import { PickerModal, type PickerOption } from '../src/components/picker-modal'
import {
  getMobileLoaderStyleLabel,
  MOBILE_LOADER_STYLES,
  type MobileLoaderStyle
} from '../src/loading/loader-style'
import { useMobileLoaderStyle } from '../src/loading/loader-style-context'

export default function AppearanceSettingsScreen(): React.JSX.Element {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const { loaderStyle, setLoaderStyle } = useMobileLoaderStyle()
  const options = useMemo<PickerOption<MobileLoaderStyle>[]>(
    () =>
      MOBILE_LOADER_STYLES.map((style) => ({
        value: style,
        label: getMobileLoaderStyleLabel(style),
        renderIcon: () => <LoadingIndicator size={20} loaderStyle={style} />
      })),
    []
  )

  return (
    <View className="bg-background pt-safe-offset-2 flex-1 px-4 pt-0">
      <View className="mt-2 mb-4 flex-row items-center">
        <Pressable
          className="mr-2 h-9 w-9 items-center justify-center"
          onPress={() => router.back()}
        >
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className="text-foreground text-sm font-bold">Appearance</Text>
      </View>

      <ScrollView contentContainerClassName="pb-6" showsVerticalScrollIndicator={false}>
        <Text className="text-muted-foreground/60 mb-1 px-1 text-[11px] font-semibold tracking-[0.5px]">
          LOADING
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-[20px]">
          Choose the animation shown while agents are working on this device.
        </Text>
        <View className="bg-card mt-2 overflow-hidden">
          <Pressable
            accessibilityRole="button"
            className="active:bg-accent flex-row items-center gap-2.5 px-3.5 py-3"
            onPress={() => setPickerOpen(true)}
          >
            <View className="w-[22px] items-center">
              <LoadingIndicator size={20} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">Loader</Text>
              <Text className="text-muted-foreground mt-[2px] text-xs">
                {getMobileLoaderStyleLabel(loaderStyle)}
              </Text>
            </View>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      </ScrollView>

      <PickerModal<MobileLoaderStyle>
        visible={pickerOpen}
        title="Loader"
        options={options}
        selected={loaderStyle}
        onSelect={setLoaderStyle}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  )
}
