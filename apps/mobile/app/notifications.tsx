import { useFocusEffect } from 'expo-router'
import { useState, useCallback, useEffect } from 'react'
import { AppState, Linking, View, Text, Pressable, Switch } from 'react-native'

import {
  ensureNotificationPermissions,
  getNotificationPermissionState,
  type NotificationPermissionState
} from '../src/notifications/notifications'
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
    <View className="bg-background flex-1 p-4">
      <View className="bg-card overflow-hidden rounded-2xl">
        <View className="flex-row items-center gap-2.5 px-3.5 py-3">
          <Text className="text-foreground flex-1 text-sm font-medium">Agent notifications</Text>
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
        <Text className="text-muted-foreground px-3.5 pb-3 text-xs leading-5">{hint}</Text>
        {notificationsBlocked && (
          <Pressable
            className="active:bg-accent bg-secondary mx-3.5 mb-3 self-start rounded-xl px-2 py-1"
            onPress={() => void Linking.openSettings()}
          >
            <Text className="text-foreground text-xs font-semibold">Open Settings</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}
