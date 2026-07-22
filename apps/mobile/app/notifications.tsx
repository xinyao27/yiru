import { useRouter, useFocusEffect } from 'expo-router'
import { useState, useCallback, useEffect } from 'react'
import { AppState, Linking, View, Text, Pressable, Switch } from 'react-native'

import { CaretLeft as ChevronLeft } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import {
  ensureNotificationPermissions,
  getNotificationPermissionState,
  type NotificationPermissionState
} from '../src/notifications/mobile-notifications'
import {
  loadPushNotificationsEnabled,
  savePushNotificationsEnabled
} from '../src/storage/preferences'

const DEFAULT_PERMISSION_STATE: NotificationPermissionState = {
  granted: false,
  status: 'undetermined',
  canAskAgain: true,
  authorizationReflectsUserChoice: false
}

export default function NotificationsScreen() {
  const router = useRouter()

  const [pushEnabled, setPushEnabled] = useState(false)
  const [permissionState, setPermissionState] = useState(DEFAULT_PERMISSION_STATE)

  const refreshSettings = useCallback(async () => {
    const [enabled, permission] = await Promise.all([
      loadPushNotificationsEnabled(),
      getNotificationPermissionState()
    ])
    setPushEnabled(enabled)
    setPermissionState(permission)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refreshSettings()
    }, [refreshSettings])
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshSettings()
      }
    })
    return () => subscription.remove()
  }, [refreshSettings])

  const togglePush = async (value: boolean) => {
    if (value) {
      const granted = await ensureNotificationPermissions()
      const permission = await getNotificationPermissionState()
      setPermissionState(permission)
      if (!granted) {
        setPushEnabled(false)
        await savePushNotificationsEnabled(false)
        return
      }
    }
    setPushEnabled(value)
    await savePushNotificationsEnabled(value)
  }

  const switchEnabled = pushEnabled && permissionState.granted
  const notificationsBlocked = permissionState.status === 'denied'
  const hint = notificationsBlocked
    ? 'Notifications are disabled in system settings.'
    : 'Get notified on this device when an agent needs your input or finishes a task.'

  return (
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Notifications</Text>
      </View>

      <View className={styles.section}>
        <View className={styles.row}>
          <Text className={styles.rowLabel}>Agent notifications</Text>
          <Switch
            value={switchEnabled}
            disabled={notificationsBlocked}
            onValueChange={(v) => void togglePush(v)}
            trackColorOffClassName="accent-secondary"
            trackColorOnClassName="accent-muted-foreground"
            thumbColorClassName="accent-foreground"
            ios_backgroundColorClassName="accent-secondary"
          />
        </View>
        <Text className={styles.hint}>{hint}</Text>
        {notificationsBlocked && (
          <Pressable
            className={cn(styles.settingsButton, styles.settingsButtonPressedActive)}
            onPress={() => void Linking.openSettings()}
          >
            <Text className={styles.settingsButtonText}>Open Settings</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = {
  container: cn('flex-1 bg-background p-4'),
  topRow: cn('flex-row items-center mb-6'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-2'),
  heading: cn('text-[20px] font-bold text-foreground'),
  section: cn('bg-card rounded-none overflow-hidden'),
  row: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  rowLabel: cn('flex-1 text-[14px] font-medium text-foreground'),
  hint: cn('text-[12px] text-muted-foreground/60 leading-[18px] px-3.5 pb-3'),
  settingsButton: cn('self-start mx-3.5 mb-3 py-1 px-2 rounded-none bg-secondary'),
  settingsButtonPressedActive: cn('active:opacity-[0.6]'),
  settingsButtonText: cn('text-foreground text-[12px] font-semibold')
} as const
