import { YIRU_GITHUB_ISSUES_URL } from '@yiru/workbench-model/product'
import { Link, useFocusEffect, type Href } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native'

import { MobileContentSection } from '~/components/content-section'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import {
  Bell,
  CaretRight as ChevronRight,
  Chat,
  Globe,
  Info,
  Key as KeyRound,
  Lifebuoy as LifeBuoy,
  Palette,
  Shapes,
  Shield,
  Terminal,
  Wrench,
  type Icon
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import {
  loadPendingHostCredentialCleanup,
  subscribePendingHostCredentialCleanup
} from '~/transport/host-credential-cleanup'
import { retryPendingHostCredentialCleanup } from '~/transport/host-store'

type SettingsNavigationItem = {
  href: Href
  icon: Icon
  label: string
}

const SETTINGS_NAVIGATION_ITEMS = [
  {
    href: '/appearance-settings',
    icon: Palette,
    label: translate('mobile.settings.appearance', 'Appearance')
  },
  {
    href: '/native-chat-settings',
    icon: Chat,
    label: translate('mobile.settings.chatUi', 'Chat UI')
  },
  {
    href: '/terminal-settings',
    icon: Terminal,
    label: translate('mobile.settings.terminal', 'Terminal')
  },
  {
    href: '/browser-settings',
    icon: Globe,
    label: translate('mobile.settings.browser', 'Browser')
  },
  {
    href: '/notifications',
    icon: Bell,
    label: translate('mobile.settings.notifications', 'Notifications')
  },
  {
    href: '/troubleshoot',
    icon: Wrench,
    label: translate('mobile.settings.troubleshooting', 'Troubleshooting')
  },
  {
    href: '/about',
    icon: Info,
    label: translate('mobile.settings.about', 'About')
  }
] satisfies readonly SettingsNavigationItem[]

function credentialCleanupMessage(
  pendingCredentialCount: number,
  credentialRetryFailed: boolean
): string {
  if (credentialRetryFailed) {
    return translate(
      'mobile.settings.credentialCleanup.retryFailed',
      "Cleanup still couldn't be confirmed. Try again later."
    )
  }
  if (pendingCredentialCount === 1) {
    return translate(
      'mobile.settings.credentialCleanup.pendingOne',
      "Couldn't confirm cleanup for 1 credential on this device."
    )
  }
  if (pendingCredentialCount > 1) {
    return translate(
      'mobile.settings.credentialCleanup.pendingMany',
      "Couldn't confirm cleanup for {{count}} credentials on this device.",
      { count: pendingCredentialCount }
    )
  }
  return translate(
    'mobile.settings.credentialCleanup.statusUnavailable',
    "Couldn't check cleanup status on this device. Retry to be safe."
  )
}

export default function SettingsScreen(): React.JSX.Element {
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
          {SETTINGS_NAVIGATION_ITEMS.map((item, index) => {
            const ItemIcon = item.icon
            return (
              <View key={item.href.toString()}>
                {index > 0 ? <View className="bg-border h-hairline mx-3" /> : null}
                <Link href={item.href} asChild>
                  <Pressable className="active:bg-accent min-h-11 flex-row items-center gap-2 px-3 py-3">
                    <View className="w-5 items-center">
                      <ItemIcon size={16} colorClassName="accent-muted-foreground" />
                    </View>
                    <Text className="text-foreground flex-1 text-sm">{item.label}</Text>
                    <View className="w-5 items-center">
                      <ChevronRight size={16} colorClassName="accent-muted-foreground" />
                    </View>
                  </Pressable>
                </Link>
              </View>
            )
          })}
        </MobileContentSection>

        {showCredentialCleanup ? (
          <MobileContentSection className="mt-3">
            <View className="flex-row items-center gap-2 px-3 py-3">
              <View className="w-5 items-center">
                <KeyRound size={16} colorClassName="accent-amber-500" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-foreground text-sm font-medium">
                  {translate(
                    'mobile.settings.credentialCleanup.title',
                    'Pairing credential cleanup'
                  )}
                </Text>
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-muted-foreground text-xs leading-5"
                >
                  {credentialCleanupMessage(pendingCredentialCount, credentialRetryFailed)}
                </Text>
              </View>
              {retryingCredentialCleanup ? (
                <View className="h-8 min-w-16 items-center justify-center">
                  <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                </View>
              ) : (
                <MobileGlassTextButton
                  accessibilityLabel={translate(
                    'mobile.settings.credentialCleanup.retryAccessibilityLabel',
                    'Retry clearing pairing credentials'
                  )}
                  label={translate('mobile.common.retry', 'Retry')}
                  onPress={() => void retryCredentialCleanup()}
                  size="small"
                />
              )}
            </View>
          </MobileContentSection>
        ) : null}

        {__DEV__ ? (
          <MobileContentSection className="mt-3">
            <Link href="/ui-lab" asChild>
              <Pressable
                accessibilityLabel={translate('mobile.settings.uiLab.open', 'Open UI Lab')}
                className="active:bg-accent min-h-11 flex-row items-center gap-2 px-3 py-3"
              >
                <View className="w-5 items-center">
                  <Shapes size={16} colorClassName="accent-muted-foreground" />
                </View>
                <Text className="text-foreground flex-1 text-sm">
                  {translate('mobile.settings.uiLab.title', 'UI Lab')}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {translate('mobile.settings.uiLab.devOnly', 'DEV ONLY')}
                </Text>
                <View className="w-5 items-center">
                  <ChevronRight size={16} colorClassName="accent-muted-foreground" />
                </View>
              </Pressable>
            </Link>
          </MobileContentSection>
        ) : null}

        <MobileContentSection className="mt-3">
          <Link href="https://yiru.ai/privacy" asChild>
            <Pressable
              accessibilityLabel={translate('mobile.settings.privacyPolicy', 'Privacy Policy')}
              className="active:bg-accent min-h-11 flex-row items-center gap-2 px-3 py-3"
            >
              <View className="w-5 items-center">
                <Shield size={16} colorClassName="accent-muted-foreground" />
              </View>
              <Text className="text-foreground flex-1 text-sm">
                {translate('mobile.settings.privacyPolicy', 'Privacy Policy')}
              </Text>
            </Pressable>
          </Link>
          <View className="bg-border h-hairline mx-3" />
          <Link href={YIRU_GITHUB_ISSUES_URL} asChild>
            <Pressable
              accessibilityLabel={translate('mobile.settings.support', 'Support')}
              className="active:bg-accent min-h-11 flex-row items-center gap-2 px-3 py-3"
            >
              <View className="w-5 items-center">
                <LifeBuoy size={16} colorClassName="accent-muted-foreground" />
              </View>
              <Text className="text-foreground flex-1 text-sm">
                {translate('mobile.settings.support', 'Support')}
              </Text>
            </Pressable>
          </Link>
        </MobileContentSection>
      </ScrollView>
    </View>
  )
}
