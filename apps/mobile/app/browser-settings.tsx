import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  Globe
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { PickerModal, type PickerOption } from '../src/components/picker-modal'
import {
  loadTerminalLinkOpenMode,
  saveTerminalLinkOpenMode,
  type MobileTerminalLinkOpenMode
} from '../src/storage/preferences'

const LINK_MODE_OPTIONS: PickerOption<MobileTerminalLinkOpenMode>[] = [
  {
    value: 'yiru-browser',
    label: 'Yiru browser on desktop',
    subtitle: 'Open in the streamed browser from your paired desktop.'
  },
  {
    value: 'phone-browser',
    label: 'Phone browser',
    subtitle: 'Open in Safari, Chrome, or another browser on this phone.'
  }
]

function linkModeLabel(mode: MobileTerminalLinkOpenMode): string {
  return (
    LINK_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? LINK_MODE_OPTIONS[0]!.label
  )
}

export default function BrowserSettingsScreen(): React.JSX.Element {
  const router = useRouter()

  const [linkMode, setLinkMode] = useState<MobileTerminalLinkOpenMode>('yiru-browser')
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    void loadTerminalLinkOpenMode().then(setLinkMode)
  }, [])

  const selectLinkMode = useCallback((mode: MobileTerminalLinkOpenMode) => {
    setLinkMode(mode)
    void saveTerminalLinkOpenMode(mode)
  }, [])

  return (
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Browser</Text>
      </View>

      <ScrollView
        contentContainerClassName={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text className={styles.groupHeading}>LINKS</Text>
        <Text className={styles.groupDescription}>
          Choose where HTTP(S) links tapped in terminal output open.
        </Text>
        <View className={cn(styles.section, styles.sectionTopGap)}>
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => setPickerOpen(true)}
          >
            <Globe size={16} colorClassName="accent-muted-foreground" />
            <View className={styles.rowContent}>
              <Text className={styles.rowLabel}>Open terminal links</Text>
              <Text className={styles.rowSublabel}>{linkModeLabel(linkMode)}</Text>
            </View>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      </ScrollView>

      <PickerModal<MobileTerminalLinkOpenMode>
        visible={pickerOpen}
        title="Open terminal links"
        options={LINK_MODE_OPTIONS}
        selected={linkMode}
        onSelect={selectLinkMode}
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
  rowContent: cn('flex-1'),
  rowLabel: cn('text-[14px] font-medium text-foreground'),
  rowSublabel: cn('text-[12px] text-muted-foreground mt-[2px]')
} as const
