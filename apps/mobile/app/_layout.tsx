import '../global.css'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import { Stack, useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { View, type TextStyle, type ViewStyle } from 'react-native'
import { Uniwind, useCSSVariable, useResolveClassNames, useUniwind } from 'uniwind'

import { IconContext } from '@/components/uniwind-icons'
import { SafeAreaListener, SafeAreaProvider } from '@/components/uniwind-native-components'

import { MobileGlassAvailabilityProvider } from '../src/components/glass/availability'
import { YiruLogo } from '../src/components/yiru-logo'
import { MobileLoaderStyleProvider } from '../src/loading/loader-style-context'
import { getNotificationNavigationPath } from '../src/notifications/notification-routing'
import { RpcClientProvider } from '../src/transport/client-context'
import { loadHosts } from '../src/transport/host-store'
import { extractPairingCodeFromUrl } from '../src/transport/pairing'
import { createMobileUiLabRpcClient } from '../src/ui-lab/rpc-client'

const IS_UI_LAB = __DEV__ && process.env.EXPO_PUBLIC_YIRU_UI_LAB === '1'

function resolveCssColor(value: string | number | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

// Why: keeps the native splash screen visible until the React tree is mounted
// and ready to render. Without this the user sees a blank white/black frame
// between the native splash and the first React paint.
SplashScreen.preventAutoHideAsync()

// Why: without this, expo-notifications silently drops notifications when
// the app is in the foreground. Setting all three to true makes iOS/Android
// display the banner, play the sound, and show the badge even while the
// app is active. This runs once at module load time before any notification
// is scheduled.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
})

export default function RootLayout() {
  const router = useRouter()
  const handledNotificationIdsRef = useRef<Set<string>>(new Set())
  const { theme } = useUniwind()
  const baseNavigationTheme = theme === 'dark' ? DarkTheme : DefaultTheme
  const [foregroundValue, backgroundValue, borderValue, primaryValue, notificationValue] =
    useCSSVariable([
      '--color-foreground',
      '--color-background',
      '--color-border',
      '--color-primary',
      '--color-destructive'
    ])
  const foreground = resolveCssColor(foregroundValue, baseNavigationTheme.colors.text)
  const background = resolveCssColor(backgroundValue, baseNavigationTheme.colors.background)
  const border = resolveCssColor(borderValue, baseNavigationTheme.colors.border)
  const primary = resolveCssColor(primaryValue, baseNavigationTheme.colors.primary)
  const notification = resolveCssColor(notificationValue, baseNavigationTheme.colors.notification)
  const iconContextValue = useMemo(
    () => ({ color: foreground, weight: 'regular' as const }),
    [foreground]
  )
  const navigationTheme = useMemo(
    () => ({
      ...baseNavigationTheme,
      colors: {
        ...baseNavigationTheme.colors,
        background,
        border,
        card: background,
        notification,
        primary,
        text: foreground
      }
    }),
    [background, baseNavigationTheme, border, foreground, notification, primary]
  )
  // Why: native Stack chrome does not inherit Uniwind classes from route content, so both must
  // resolve the same live theme tokens when system appearance changes while the app is mounted.
  const headerTitleStyle = useResolveClassNames('text-foreground text-base font-semibold') as Pick<
    TextStyle,
    'fontFamily' | 'fontSize' | 'fontWeight'
  > & { color?: string }
  const contentStyle = useResolveClassNames('bg-background') as ViewStyle

  // Why: startup routing avoids iOS's custom-scheme confirmation, keeping UI Lab one command.
  useEffect(() => {
    if (IS_UI_LAB) {
      router.replace('/ui-lab')
    }
  }, [router])

  // Why: route `yiru://pair?...` deep links to the confirm screen so
  // the same pairing flow runs whether the link arrived via QR scan,
  // paste, AirDrop, Messages, or `xcrun simctl openurl`. getInitialURL
  // covers cold-start (link tapped while app was closed); the listener
  // covers warm-start (link tapped while app is in memory).
  useEffect(() => {
    function handleUrl(url: string) {
      const code = extractPairingCodeFromUrl(url)
      if (code) {
        // Why: Android camera launches can leave Expo Router's unmatched
        // `yiru://pair` route underneath this screen; replacing keeps cancel
        // and edge-back from revealing the router error page.
        router.replace({ pathname: '/pair-confirm', params: { code } })
      }
    }

    void Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl(url)
      }
    })

    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url))
    return () => sub.remove()
  }, [router])

  // Why: iOS delivers local notification taps through expo-notifications,
  // not Linking. Route both cold-start and warm-start responses to the host
  // and worktree that scheduled the notification.
  useEffect(() => {
    let disposed = false

    function clearLastNotificationResponse() {
      try {
        Notifications.clearLastNotificationResponse()
      } catch {
        // Older native shells may not expose the clear API; duplicate guards
        // still protect the current JS runtime.
      }
    }

    function getInitialNotificationResponse(): Notifications.NotificationResponse | null {
      try {
        return Notifications.getLastNotificationResponse()
      } catch {
        return null
      }
    }

    async function getNavigationPath(data: unknown): Promise<string | null> {
      const hosts = await loadHosts().catch(() => null)
      return getNotificationNavigationPath(data, {
        knownHostIds: hosts ? new Set(hosts.map((host) => host.id)) : undefined
      })
    }

    async function handleNotificationResponse(response: Notifications.NotificationResponse) {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        clearLastNotificationResponse()
        return
      }

      const notificationId = response.notification.request.identifier
      if (handledNotificationIdsRef.current.has(notificationId)) {
        return
      }
      handledNotificationIdsRef.current.add(notificationId)
      // Why: RootLayout never unmounts, so cap this tap-dedup set (FIFO) rather
      // than letting it grow one id per notification tapped for the app's life.
      if (handledNotificationIdsRef.current.size > 256) {
        const oldest = handledNotificationIdsRef.current.values().next().value
        if (oldest !== undefined) {
          handledNotificationIdsRef.current.delete(oldest)
        }
      }

      const path = await getNavigationPath(response.notification.request.content.data)
      clearLastNotificationResponse()
      if (disposed) {
        return
      }
      if (path) {
        router.push(path)
      }
    }

    const initialResponse = getInitialNotificationResponse()
    if (initialResponse) {
      void handleNotificationResponse(initialResponse)
    }

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response)
    })
    return () => {
      disposed = true
      sub.remove()
    }
  }, [router])

  // Why: hide the native splash only once the navigation Stack has been laid
  // out — this is the earliest moment the user will see actual app content.
  // Previously the splash hid when a placeholder View rendered, leaving a
  // grey gap before the real screen appeared.
  const onNavigatorLayout = useCallback(async () => {
    await SplashScreen.hideAsync()
  }, [])

  return (
    <SafeAreaProvider>
      <SafeAreaListener
        onChange={({ insets }) => {
          // Why: free Uniwind reads safe-area utilities from explicit native inset updates.
          Uniwind.updateInsets(insets)
        }}
      >
        <IconContext.Provider value={iconContextValue}>
          <MobileLoaderStyleProvider>
            <RpcClientProvider
              createClientOverride={__DEV__ ? createMobileUiLabRpcClient : undefined}
            >
              <View className="bg-background flex-1" onLayout={onNavigatorLayout}>
                <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
                <MobileGlassAvailabilityProvider>
                  <ThemeProvider value={navigationTheme}>
                    <Stack
                      screenOptions={{
                        headerBackButtonDisplayMode: 'minimal',
                        headerStyle: contentStyle,
                        headerTintColor: foreground,
                        headerTitleStyle,
                        contentStyle,
                        headerShadowVisible: false
                        // Why: deliberately no `orientation` screenOption. react-native-screens
                        // has no value that respects the device rotation lock — even 'default'
                        // calls setRequestedOrientation(UNSPECIFIED) at runtime, overriding the
                        // manifest. Leaving it unset lets the manifest's "fullUser" (set by the
                        // android-respect-rotation-lock config plugin) honor the auto-rotate lock.
                      }}
                    >
                      <Stack.Screen
                        name="index"
                        options={{
                          headerBackVisible: false,
                          title: 'Yiru',
                          headerShown: true,
                          headerTitle: () => (
                            <YiruLogo size={22} colorClassName="accent-foreground" />
                          )
                        }}
                      />
                      <Stack.Screen name="pair-scan" options={{ title: 'Pair with desktop' }} />
                      <Stack.Screen name="pair" options={{ headerShown: false }} />
                      <Stack.Screen name="pair-confirm" options={{ headerShown: false }} />
                      <Stack.Screen
                        name="notification-opt-in"
                        options={{
                          headerShown: false,
                          presentation: 'modal',
                          gestureEnabled: false
                        }}
                      />
                      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                      <Stack.Screen name="appearance-settings" options={{ title: 'Appearance' }} />
                      <Stack.Screen name="native-chat-settings" options={{ title: 'Chat UI' }} />
                      <Stack.Screen name="terminal-settings" options={{ title: 'Terminal' }} />
                      <Stack.Screen name="browser-settings" options={{ title: 'Browser' }} />
                      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
                      <Stack.Screen name="troubleshoot" options={{ title: 'Troubleshooting' }} />
                      <Stack.Screen name="connection-log" options={{ title: 'Connection log' }} />
                      <Stack.Screen name="about" options={{ title: 'About' }} />
                      <Stack.Screen name="ui-lab" options={{ title: 'UI Lab' }} />
                      <Stack.Screen name="h" options={{ headerShown: false }} />
                    </Stack>
                  </ThemeProvider>
                </MobileGlassAvailabilityProvider>
              </View>
            </RpcClientProvider>
          </MobileLoaderStyleProvider>
        </IconContext.Provider>
      </SafeAreaListener>
    </SafeAreaProvider>
  )
}
