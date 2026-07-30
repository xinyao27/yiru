import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, BackHandler, ScrollView, Text, View } from 'react-native'

import { BellRinging as BellRing } from '@/components/uniwind-icons'
import { SafeAreaView } from '@/components/uniwind-native-components'

import { MobileGlassGroup } from '../src/components/glass/group'
import { MobileGlassSurface } from '../src/components/glass/surface'
import { MobileGlassTextButton } from '../src/components/glass/text-button'
import { YiruLogo } from '../src/components/yiru-logo'
import { ensureNotificationPermissions } from '../src/notifications/notifications'
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
    <SafeAreaView className="bg-background flex-1 px-6">
      {/* Why: this screen cannot be dismissed with Back, so scrolling keeps
          every decision reachable in landscape and at large text sizes. */}
      <ScrollView contentContainerClassName="grow" showsVerticalScrollIndicator={false}>
        <View className="min-h-13 flex-row items-center gap-2">
          <YiruLogo size={22} colorClassName="accent-foreground" />
          <Text className="text-foreground text-sm font-bold">Yiru</Text>
        </View>

        <View className="grow items-center justify-center py-6">
          <MobileGlassSurface className="mb-6 h-16 w-16 items-center justify-center rounded-3xl">
            <BellRing size={30} colorClassName="accent-foreground" />
          </MobileGlassSurface>
          <Text className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Notifications
          </Text>
          <Text className="text-foreground max-w-md text-center text-sm font-bold tracking-tight">
            Stay updated while away
          </Text>
          <Text className="text-muted-foreground mt-3 max-w-md text-center text-sm leading-5">
            Get notified on this device when an agent needs your input or finishes a task.
          </Text>
        </View>

        <View className="w-full max-w-md self-center pb-4">
          {error ? (
            <Text
              className="text-destructive mb-2 text-center text-xs leading-5"
              accessibilityRole="alert"
            >
              {error}
            </Text>
          ) : null}
          <MobileGlassGroup className="gap-2" spacing={8}>
            {busyChoice === 'enable' ? (
              <View className="min-h-11 items-center justify-center">
                <ActivityIndicator colorClassName="accent-primary-foreground" />
              </View>
            ) : (
              <MobileGlassTextButton
                accessibilityLabel="Enable agent notifications"
                disabled={busyChoice !== null}
                isFullWidth
                isProminent
                label="Enable notifications"
                onPress={() => void choose('enable')}
                size="large"
              />
            )}
            {busyChoice === 'skip' ? (
              <View className="min-h-11 items-center justify-center">
                <ActivityIndicator colorClassName="accent-muted-foreground" />
              </View>
            ) : (
              <MobileGlassTextButton
                disabled={busyChoice !== null}
                isFullWidth
                label="Not now"
                onPress={() => void choose('skip')}
                size="large"
              />
            )}
          </MobileGlassGroup>
          <Text className="text-muted-foreground mt-2 text-center text-xs leading-5">
            You can change this any time in Settings.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
