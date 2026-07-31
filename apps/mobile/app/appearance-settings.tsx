import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import {
  MOBILE_THEME_MODES,
  type MobileThemeMode,
  useMobileTheme
} from '~/appearance/theme-preference'
import { MobileContentSection } from '~/components/content-section'
import { MobileGlassSegmentedControl } from '~/components/glass/segmented-control'
import type { MobileGlassSegmentOption } from '~/components/glass/segmented-control-props'
import { LoadingIndicator } from '~/components/loading-indicator'
import { PickerModal, type PickerOption } from '~/components/picker-modal'
import { CaretRight as ChevronRight } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import {
  getMobileLoaderStyleLabel,
  MOBILE_LOADER_STYLES,
  type MobileLoaderStyle
} from '~/loading/loader-style'
import { useMobileLoaderStyle } from '~/loading/loader-style-context'

export default function AppearanceSettingsScreen(): React.JSX.Element {
  const [loaderPickerOpen, setLoaderPickerOpen] = useState(false)
  const { themeMode, setThemeMode } = useMobileTheme()
  const { loaderStyle, setLoaderStyle } = useMobileLoaderStyle()
  const themeOptions = useMemo<MobileGlassSegmentOption<MobileThemeMode>[]>(
    () =>
      MOBILE_THEME_MODES.map((mode) => ({
        value: mode,
        label: getThemeModeLabel(mode)
      })),
    []
  )
  const loaderOptions = useMemo<PickerOption<MobileLoaderStyle>[]>(
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
          {translate('mobile.appearance.theme.section', 'THEME')}
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          {translate(
            'mobile.appearance.theme.description',
            'Choose how Yiru looks on this device.'
          )}
        </Text>
        <View className="mt-3">
          <MobileGlassSegmentedControl
            accessibilityLabel={translate('mobile.appearance.theme.label', 'Theme')}
            onChange={setThemeMode}
            options={themeOptions}
            value={themeMode}
          />
        </View>

        <Text className="text-muted-foreground mt-6 mb-1 px-1 text-xs font-semibold tracking-wide">
          {translate('mobile.appearance.loading.section', 'LOADING')}
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          {translate(
            'mobile.appearance.loading.description',
            'Choose the animation shown while agents are working on this device.'
          )}
        </Text>
        <MobileContentSection className="mt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('mobile.appearance.loader.label', 'Loader')}
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => setLoaderPickerOpen(true)}
          >
            <View className="w-5 items-center">
              <LoadingIndicator size={20} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">
                {translate('mobile.appearance.loader.label', 'Loader')}
              </Text>
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
        visible={loaderPickerOpen}
        title={translate('mobile.appearance.loader.label', 'Loader')}
        options={loaderOptions}
        selected={loaderStyle}
        onSelect={setLoaderStyle}
        onClose={() => setLoaderPickerOpen(false)}
      />
    </View>
  )
}

function getThemeModeLabel(mode: MobileThemeMode): string {
  switch (mode) {
    case 'system':
      return translate('mobile.appearance.theme.system.label', 'System')
    case 'light':
      return translate('mobile.appearance.theme.light.label', 'Light')
    case 'dark':
      return translate('mobile.appearance.theme.dark.label', 'Dark')
  }
}
