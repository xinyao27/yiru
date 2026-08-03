import { useFocusEffect } from 'expo-router'
import { useState, useCallback, useEffect } from 'react'
import { AppState, Linking, View } from 'react-native'

import { MobileContentSection } from '~/components/content-section'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { SettingsToggleRow } from '~/components/settings-toggle-row'
import { translate } from '~/i18n/translate'
import {
  ensureNotificationPermissions,
  getNotificationPermissionState,
  type NotificationPermissionState
} from '~/notifications/notifications'
import { loadPushNotificationsEnabled, savePushNotificationsEnabled } from '~/storage/preferences'

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
    ? translate(
        'mobile.notifications.agentNotifications.blockedHint',
        'Notifications are disabled in system settings.'
      )
    : translate(
        'mobile.notifications.agentNotifications.hint',
        'Get notified on this device when an agent needs your input or finishes a task.'
      )

  return (
    <View className="bg-background flex-1 p-4">
      <MobileContentSection>
        <SettingsToggleRow
          disabled={notificationsBlocked}
          label={translate('mobile.notifications.agentNotifications.label', 'Agent notifications')}
          onValueChange={(value) => void togglePush(value)}
          supportingText={hint}
          value={switchEnabled}
        />
        {notificationsBlocked && (
          <MobileGlassTextButton
            className="mx-3 mb-3 self-start"
            label={translate('mobile.notifications.openSettings', 'Open Settings')}
            onPress={() => void Linking.openSettings()}
            size="small"
          />
        )}
      </MobileContentSection>
    </View>
  )
}
