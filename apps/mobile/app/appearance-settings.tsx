import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { CaretRight as ChevronRight } from '@/components/uniwind-icons'

import { MobileContentSection } from '../src/components/content-section'
import { LoadingIndicator } from '../src/components/loading-indicator'
import { PickerModal, type PickerOption } from '../src/components/picker-modal'
import {
  getMobileLoaderStyleLabel,
  MOBILE_LOADER_STYLES,
  type MobileLoaderStyle
} from '../src/loading/loader-style'
import { useMobileLoaderStyle } from '../src/loading/loader-style-context'

export default function AppearanceSettingsScreen(): React.JSX.Element {
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
    <View className="bg-background flex-1 px-4 pt-4">
      <ScrollView contentContainerClassName="pb-6" showsVerticalScrollIndicator={false}>
        <Text className="text-muted-foreground mb-1 px-1 text-xs font-semibold tracking-wide">
          LOADING
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          Choose the animation shown while agents are working on this device.
        </Text>
        <MobileContentSection className="mt-2">
          <Pressable
            accessibilityRole="button"
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => setPickerOpen(true)}
          >
            <View className="w-5 items-center">
              <LoadingIndicator size={20} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">Loader</Text>
              <Text className="text-muted-foreground mt-1 text-xs">
                {getMobileLoaderStyleLabel(loaderStyle)}
              </Text>
            </View>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
        </MobileContentSection>
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
