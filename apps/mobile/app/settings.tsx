import { YIRU_GITHUB_ISSUES_URL } from '@yiru/workbench-model/product'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { View, Text, Pressable, Linking, ActivityIndicator, ScrollView } from 'react-native'

import {
  CaretRight as ChevronRight,
  Info,
  Bell,
  Wrench,
  Shield,
  Lifebuoy as LifeBuoy,
  Globe,
  Palette,
  Shapes,
  Chat as MessageSquare,
  Terminal as TerminalIcon,
  Key as KeyRound
} from '@/components/uniwind-icons'

import { MobileContentSection } from '../src/components/content-section'
import { MobileGlassTextButton } from '../src/components/glass/text-button'
import {
  loadPendingHostCredentialCleanup,
  subscribePendingHostCredentialCleanup
} from '../src/transport/host-credential-cleanup'
import { retryPendingHostCredentialCleanup } from '../src/transport/host-store'

export default function SettingsScreen() {
  const router = useRouter()

  const [pendingCredentialIds, setPendingCredentialIds] = useState<string[]>([])
  const [credentialStorageUnreadable, setCredentialStorageUnreadable] = useState(false)
  const [retryingCredentialCleanup, setRetryingCredentialCleanup] = useState(false)
  const [credentialRetryFailed, setCredentialRetryFailed] = useState(false)
  const credentialRefreshGenerationRef = useRef(0)

  useFocusEffect(
    useCallback(() => {
      let active = true
      setCredentialRetryFailed(false)
      const refresh = () => {
        const generation = ++credentialRefreshGenerationRef.current
        void loadPendingHostCredentialCleanup().then((state) => {
          if (active && generation === credentialRefreshGenerationRef.current) {
            setPendingCredentialIds(state.ids)
            setCredentialStorageUnreadable(state.storageUnreadable)
            // Why: neutral copy once the queue is confirmed empty so a later
            // pending set does not inherit a previous Retry failure message.
            if (state.ids.length === 0 && !state.storageUnreadable) {
              setCredentialRetryFailed(false)
            }
          }
        })
      }
      const unsubscribe = subscribePendingHostCredentialCleanup(refresh)
      refresh()
      return () => {
        active = false
        credentialRefreshGenerationRef.current += 1
        unsubscribe()
      }
    }, [])
  )

  const retryCredentialCleanup = useCallback(async () => {
    if (retryingCredentialCleanup) {
      return
    }
    setCredentialRetryFailed(false)
    setRetryingCredentialCleanup(true)
    try {
      const result = await retryPendingHostCredentialCleanup()
      setPendingCredentialIds(result.remainingIds)
      setCredentialStorageUnreadable(result.storageUnreadable)
      setCredentialRetryFailed(result.remainingIds.length > 0 || result.storageUnreadable)
    } catch {
      setCredentialRetryFailed(true)
    } finally {
      setRetryingCredentialCleanup(false)
    }
  }, [retryingCredentialCleanup])

  const pendingCredentialCount = pendingCredentialIds.length
  // Why: show the cleanup card whenever cleanup is pending OR the durable queue
  // is unreadable — an unreadable queue can hide an orphaned token, so keep a
  // retry affordance rather than a silently-empty (hidden) section.
  const showCredentialCleanup = pendingCredentialCount > 0 || credentialStorageUnreadable

  return (
    <View className="bg-background flex-1 px-4 pt-4">
      <ScrollView contentContainerClassName="pb-safe-offset-4" showsVerticalScrollIndicator={false}>
        <MobileContentSection>
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => router.push('/appearance-settings')}
            accessibilityLabel="Appearance"
            accessibilityRole="button"
          >
            <View className="w-5 items-center">
              <Palette size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">Appearance</Text>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
          <View className="bg-border h-hairline mx-3" />
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => router.push('/native-chat-settings')}
            accessibilityLabel="Chat UI"
            accessibilityRole="button"
          >
            <View className="w-5 items-center">
              <MessageSquare size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">Chat UI</Text>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
          <View className="bg-border h-hairline mx-3" />
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => router.push('/terminal-settings')}
            accessibilityLabel="Terminal"
            accessibilityRole="button"
          >
            <View className="w-5 items-center">
              <TerminalIcon size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">Terminal</Text>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
          <View className="bg-border h-hairline mx-3" />
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => router.push('/browser-settings')}
            accessibilityLabel="Browser"
            accessibilityRole="button"
          >
            <View className="w-5 items-center">
              <Globe size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">Browser</Text>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
          <View className="bg-border h-hairline mx-3" />
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => router.push('/notifications')}
            accessibilityLabel="Notifications"
            accessibilityRole="button"
          >
            <View className="w-5 items-center">
              <Bell size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">Notifications</Text>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
          <View className="bg-border h-hairline mx-3" />
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => router.push('/troubleshoot')}
            accessibilityLabel="Troubleshooting"
            accessibilityRole="button"
          >
            <View className="w-5 items-center">
              <Wrench size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">Troubleshooting</Text>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
          <View className="bg-border h-hairline mx-3" />
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => router.push('/about')}
            accessibilityLabel="About"
            accessibilityRole="button"
          >
            <View className="w-5 items-center">
              <Info size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">About</Text>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
        </MobileContentSection>

        {showCredentialCleanup ? (
          <MobileContentSection className="mt-3">
            <View className="flex-row items-center gap-2 px-3 py-3">
              <View className="w-5 items-center">
                <KeyRound size={16} colorClassName="accent-amber-500" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-foreground text-sm font-medium">
                  Pairing credential cleanup
                </Text>
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-muted-foreground text-xs leading-5"
                >
                  {credentialRetryFailed
                    ? "Cleanup still couldn't be confirmed. Try again later."
                    : pendingCredentialCount > 0
                      ? `Couldn't confirm cleanup for ${pendingCredentialCount} credential${pendingCredentialCount === 1 ? '' : 's'} on this device.`
                      : "Couldn't check cleanup status on this device. Retry to be safe."}
                </Text>
              </View>
              {retryingCredentialCleanup ? (
                <View className="h-8 min-w-16 items-center justify-center">
                  <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                </View>
              ) : (
                <MobileGlassTextButton
                  accessibilityLabel="Retry clearing pairing credentials"
                  label="Retry"
                  onPress={() => void retryCredentialCleanup()}
                  size="small"
                />
              )}
            </View>
          </MobileContentSection>
        ) : null}

        {__DEV__ ? (
          <MobileContentSection className="mt-3">
            <Pressable
              accessibilityLabel="Open UI Lab"
              accessibilityRole="button"
              className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
              onPress={() => router.push('/ui-lab')}
            >
              <View className="w-5 items-center">
                <Shapes size={16} colorClassName="accent-muted-foreground" />
              </View>
              <Text className="text-foreground flex-1 text-sm">UI Lab</Text>
              <Text className="text-muted-foreground text-xs">DEV ONLY</Text>
              <View className="w-5 items-center">
                <ChevronRight size={16} colorClassName="accent-muted-foreground" />
              </View>
            </Pressable>
          </MobileContentSection>
        ) : null}

        <MobileContentSection className="mt-3">
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => void Linking.openURL('https://yiru.ai/privacy')}
            accessibilityLabel="Privacy Policy"
            accessibilityRole="link"
          >
            <View className="w-5 items-center">
              <Shield size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">Privacy Policy</Text>
          </Pressable>
          <View className="bg-border h-hairline mx-3" />
          <Pressable
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => void Linking.openURL(YIRU_GITHUB_ISSUES_URL)}
            accessibilityLabel="Support"
            accessibilityRole="link"
          >
            <View className="w-5 items-center">
              <LifeBuoy size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-foreground flex-1 text-sm">Support</Text>
          </Pressable>
        </MobileContentSection>
      </ScrollView>
    </View>
  )
}
