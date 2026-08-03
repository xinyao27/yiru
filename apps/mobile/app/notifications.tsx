import { useFocusEffect } from 'expo-router'
import { useState, useCallback, useEffect, useRef } from 'react'
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
  const [isUpdating, setIsUpdating] = useState(false)
  const isUpdatingRef = useRef(false)
  const refreshGenerationRef = useRef(0)

  const refreshSettings = useCallback(async () => {
    const generation = ++refreshGenerationRef.current
    const [enabled, permission] = await Promise.all([
      loadPushNotificationsEnabled(),
      getNotificationPermissionState()
    ])
    if (generation !== refreshGenerationRef.current || isUpdatingRef.current) {
      return
    }
    setPushEnabled(enabled)
    setPermissionState(permission)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refreshSettings()
      return () => {
        refreshGenerationRef.current += 1
      }
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
    if (isUpdatingRef.current) {
      return
    }
    isUpdatingRef.current = true
    refreshGenerationRef.current += 1
    setIsUpdating(true)
    let shouldRefresh = false
    try {
      if (value) {
        const granted = await ensureNotificationPermissions()
        const permission = await getNotificationPermissionState()
        setPermissionState(permission)
        if (!granted) {
          await savePushNotificationsEnabled(false)
          setPushEnabled(false)
          return
        }
      }
      await savePushNotificationsEnabled(value)
      setPushEnabled(value)
    } catch {
      shouldRefresh = true
    } finally {
      isUpdatingRef.current = false
      setIsUpdating(false)
      if (shouldRefresh) {
        void refreshSettings()
      }
    }
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
          disabled={notificationsBlocked || isUpdating}
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
