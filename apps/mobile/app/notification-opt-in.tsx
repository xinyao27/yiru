import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, BackHandler, Pressable, ScrollView, Text, View } from 'react-native'

import { BellRinging as BellRing } from '@/components/uniwind-icons'
import { SafeAreaView } from '@/components/uniwind-native-components'
import { cn } from '@/style/class-names'

import { YiruLogo } from '../src/components/yiru-logo'
import { ensureNotificationPermissions } from '../src/notifications/mobile-notifications'
import { savePushNotificationsEnabled } from '../src/storage/preferences'

export default function NotificationOptInScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ hostId?: string | string[] }>()
  const hostId = Array.isArray(params.hostId) ? params.hostId[0] : params.hostId
  const [busyChoice, setBusyChoice] = useState<'enable' | 'skip' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Why: this one-time screen requires an explicit Enable or Not now choice;
  // disabling back gestures alone would still leave Android hardware back open.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
      return () => subscription.remove()
    }, [])
  )

  const continueToApp = useCallback(() => {
    router.replace(hostId ? `/h/${hostId}` : '/')
  }, [hostId, router])

  const choose = useCallback(
    async (choice: 'enable' | 'skip') => {
      if (busyChoice) {
        return
      }
      setBusyChoice(choice)
      setError(null)
      try {
        const enabled = choice === 'enable' ? await ensureNotificationPermissions() : false
        await savePushNotificationsEnabled(enabled)
        continueToApp()
      } catch {
        setError('Notification settings could not be updated. Try again.')
        setBusyChoice(null)
      }
    },
    [busyChoice, continueToApp]
  )

  return (
    <SafeAreaView className={styles.container}>
      <ScrollView
        contentContainerClassName={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View className={styles.brandRow}>
          <YiruLogo size={22} />
          <Text className={styles.brandName}>Yiru</Text>
        </View>

        <View className={styles.content}>
          <View className={styles.iconSurface}>
            <BellRing size={30} colorClassName="accent-foreground" />
          </View>
          <Text className={styles.eyebrow}>Notifications</Text>
          <Text className={styles.title}>Stay updated while away</Text>
          <Text className={styles.body}>
            Get notified on this device when an agent needs your input or finishes a task.
          </Text>
        </View>

        <View className={styles.footer}>
          {error ? (
            <Text className={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enable agent notifications"
            disabled={busyChoice !== null}
            className={cn(
              styles.primaryButton,
              styles.buttonPressedActive,
              busyChoice !== null && styles.buttonDisabled
            )}
            onPress={() => void choose('enable')}
          >
            {busyChoice === 'enable' ? (
              <ActivityIndicator colorClassName="accent-primary-foreground" />
            ) : (
              <Text className={styles.primaryButtonText}>Enable notifications</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busyChoice !== null}
            className={cn(
              styles.secondaryButton,
              styles.buttonPressedActive,
              busyChoice !== null && styles.buttonDisabled
            )}
            onPress={() => void choose('skip')}
          >
            {busyChoice === 'skip' ? (
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            ) : (
              <Text className={styles.secondaryButtonText}>Not now</Text>
            )}
          </Pressable>
          <Text className={styles.footerNote}>You can change this any time in Settings.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = {
  container: cn('flex-1 bg-background px-6'),
  // Why: this decision screen cannot be dismissed with Back, so every action
  // must remain reachable in landscape and with accessibility text scaling.
  scrollContent: cn('grow'),
  brandRow: cn('min-h-[52px] flex-row items-center gap-2'),
  brandName: cn('text-foreground text-[17px] font-bold'),
  content: cn('grow items-center justify-center py-6'),
  iconSurface: cn('w-16 h-16 rounded-none items-center justify-center bg-secondary mb-6'),
  eyebrow: cn(
    'text-muted-foreground/60 text-[11px] font-semibold tracking-[0.55px] uppercase mb-2'
  ),
  title: cn('max-w-[420px] text-foreground text-[26px] font-bold tracking-[-0.3px] text-center'),
  body: cn('max-w-[420px] text-muted-foreground text-[14px] leading-[21px] text-center mt-3'),
  footer: cn('w-full max-w-[420px] self-center pb-4'),
  primaryButton: cn('min-h-11 items-center justify-center rounded-none bg-primary py-2'),
  primaryButtonText: cn('text-primary-foreground text-[14px] font-semibold'),
  secondaryButton: cn('min-h-11 items-center justify-center rounded-none mt-1 py-2'),
  secondaryButtonText: cn('text-muted-foreground text-[14px] font-medium'),
  buttonPressedActive: cn('active:opacity-[0.72]'),
  buttonDisabled: cn('opacity-[0.58]'),
  footerNote: cn('text-muted-foreground/60 text-[12px] leading-[18px] text-center mt-2'),
  error: cn('text-destructive text-[12px] leading-[18px] text-center mb-2')
} as const
