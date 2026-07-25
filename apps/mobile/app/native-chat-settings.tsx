import { useRouter } from 'expo-router'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'

import { CaretLeft as ChevronLeft } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { useMobileDefaultSessionViewPreference } from '../src/session/use-mobile-default-session-view-preference'

export default function NativeChatSettingsScreen() {
  const router = useRouter()
  const { defaultView, setDefaultView } = useMobileDefaultSessionViewPreference()
  const chatDefault = defaultView === 'chat'

  return (
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          className={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Chat UI</Text>
      </View>

      <ScrollView contentContainerClassName="pb-safe-offset-4" showsVerticalScrollIndicator={false}>
        <Text className={styles.groupHeading}>DEFAULT VIEW</Text>
        <Text className={styles.groupDescription}>
          Choose how supported agent sessions open on this device. Terminal shows the raw CLI; Chat
          UI shows a chat interface like the desktop app. You can still switch any individual
          session from its long-press menu.
        </Text>
        <View className={cn(styles.section, styles.sectionTopGap)}>
          <View className={styles.row}>
            <View className={styles.rowContent}>
              <Text className={styles.rowLabel}>Open sessions in Chat UI</Text>
              <Text className={styles.rowSublabel}>{chatDefault ? 'On' : 'Off'}</Text>
            </View>
            <Switch
              accessibilityLabel="Open sessions in Chat UI"
              value={chatDefault}
              onValueChange={(next) => setDefaultView(next ? 'chat' : 'terminal')}
              trackColorOffClassName="accent-accent"
              trackColorOnClassName="accent-muted-foreground"
              thumbColorClassName="accent-foreground"
              ios_backgroundColorClassName="accent-accent"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = {
  container: cn('flex-1 bg-background px-4'),
  topRow: cn('flex-row items-center mt-2 mb-4'),
  backButton: cn('w-9 h-9 items-center justify-center mr-2'),
  heading: cn('text-[20px] font-bold text-foreground'),
  groupHeading: cn('text-[11px] font-semibold text-muted-foreground/60 tracking-[0.5px] mb-1 px-1'),
  groupDescription: cn('text-[13px] text-muted-foreground leading-[20px] px-1'),
  section: cn('bg-card overflow-hidden'),
  sectionTopGap: cn('mt-2'),
  row: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  rowContent: cn('flex-1'),
  rowLabel: cn('text-[14px] font-medium text-foreground'),
  rowSublabel: cn('text-[12px] text-muted-foreground mt-[2px]')
} as const
