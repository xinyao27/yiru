import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { LoadingIndicator } from '../src/components/loading-indicator'
import { PickerModal, type PickerOption } from '../src/components/picker-modal'
import {
  getMobileLoaderStyleLabel,
  MOBILE_LOADER_STYLES,
  type MobileLoaderStyle
} from '../src/loading/mobile-loader-style'
import { useMobileLoaderStyle } from '../src/loading/mobile-loader-style-context'

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
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Appearance</Text>
      </View>

      <ScrollView
        contentContainerClassName={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text className={styles.groupHeading}>LOADING</Text>
        <Text className={styles.groupDescription}>
          Choose the animation shown while agents are working on this device.
        </Text>
        <View className={cn(styles.section, styles.sectionTopGap)}>
          <Pressable
            accessibilityRole="button"
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => setPickerOpen(true)}
          >
            <View className={styles.preview}>
              <LoadingIndicator size={20} />
            </View>
            <View className={styles.rowContent}>
              <Text className={styles.rowLabel}>Loader</Text>
              <Text className={styles.rowSublabel}>{getMobileLoaderStyleLabel(loaderStyle)}</Text>
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

const styles = {
  container: cn('flex-1 bg-background px-4 pt-0'),
  topRow: cn('flex-row items-center mt-2 mb-4'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-2'),
  heading: cn('text-[20px] font-bold text-foreground'),
  scrollContent: cn('pb-6'),
  groupHeading: cn('text-[11px] font-semibold text-muted-foreground/60 tracking-[0.5px] mb-1 px-1'),
  groupDescription: cn('text-[13px] text-muted-foreground leading-[20px] px-1'),
  section: cn('bg-card rounded-none overflow-hidden'),
  sectionTopGap: cn('mt-2'),
  row: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  rowPressedActive: cn('active:bg-secondary'),
  preview: cn('w-[22px] items-center'),
  rowContent: cn('flex-1'),
  rowLabel: cn('text-[14px] font-medium text-foreground'),
  rowSublabel: cn('text-[12px] text-muted-foreground mt-[2px]')
} as const
