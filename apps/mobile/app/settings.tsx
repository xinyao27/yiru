import { YIRU_GITHUB_ISSUES_URL } from '@yiru/workbench-model/product'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { View, Text, Pressable, Linking, ActivityIndicator, ScrollView } from 'react-native'

import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  Info,
  Bell,
  Wrench,
  Shield,
  Lifebuoy as LifeBuoy,
  Microphone as Mic,
  Globe,
  Palette,
  Terminal as TerminalIcon,
  Key as KeyRound
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

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
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Settings</Text>
      </View>

      <ScrollView contentContainerClassName="pb-safe-offset-4" showsVerticalScrollIndicator={false}>
        <View className={styles.section}>
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => router.push('/appearance-settings')}
          >
            <Palette size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>Appearance</Text>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
          <View className={styles.separator} />
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => router.push('/terminal-settings')}
          >
            <TerminalIcon size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>Terminal</Text>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
          <View className={styles.separator} />
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => router.push('/browser-settings')}
          >
            <Globe size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>Browser</Text>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
          <View className={styles.separator} />
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => router.push('/voice-settings')}
          >
            <Mic size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>Voice</Text>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
          <View className={styles.separator} />
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => router.push('/notifications')}
          >
            <Bell size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>Notifications</Text>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
          <View className={styles.separator} />
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => router.push('/troubleshoot')}
          >
            <Wrench size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>Troubleshooting</Text>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
          <View className={styles.separator} />
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => router.push('/about')}
          >
            <Info size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>About</Text>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>

        {showCredentialCleanup ? (
          <View className={cn(styles.section, styles.sectionSpacer)}>
            <View className={styles.credentialCleanupRow}>
              <KeyRound size={16} colorClassName="accent-amber-500" />
              <View className={styles.credentialCleanupCopy}>
                <Text className={styles.credentialCleanupTitle}>Pairing credential cleanup</Text>
                <Text accessibilityLiveRegion="polite" className={styles.rowHint}>
                  {credentialRetryFailed
                    ? "Cleanup still couldn't be confirmed. Try again later."
                    : pendingCredentialCount > 0
                      ? `Couldn't confirm cleanup for ${pendingCredentialCount} credential${pendingCredentialCount === 1 ? '' : 's'} on this device.`
                      : "Couldn't check cleanup status on this device. Retry to be safe."}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry clearing pairing credentials"
                accessibilityState={{
                  busy: retryingCredentialCleanup,
                  disabled: retryingCredentialCleanup
                }}
                disabled={retryingCredentialCleanup}
                hitSlop={8}
                className={cn(
                  styles.retryButton,
                  !retryingCredentialCleanup && styles.rowPressedActive
                )}
                onPress={() => void retryCredentialCleanup()}
              >
                {retryingCredentialCleanup ? (
                  <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                ) : (
                  <Text className={styles.retryButtonText}>Retry</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        <View className={cn(styles.section, styles.sectionSpacer)}>
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => void Linking.openURL('https://yiru.ai/privacy')}
          >
            <Shield size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>Privacy Policy</Text>
          </Pressable>
          <View className={styles.separator} />
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => void Linking.openURL(YIRU_GITHUB_ISSUES_URL)}
          >
            <LifeBuoy size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.rowLabel}>Support</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = {
  container: cn('flex-1 bg-background px-4'),
  topRow: cn('flex-row items-center mb-6'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-2'),
  heading: cn('text-[20px] font-bold text-foreground'),
  section: cn('bg-card rounded-none overflow-hidden'),
  sectionSpacer: cn('mt-3'),
  row: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  rowPressedActive: cn('active:bg-secondary'),
  rowLabel: cn('flex-1 text-[14px] font-medium text-foreground'),
  credentialCleanupRow: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  credentialCleanupCopy: cn('flex-1 gap-1'),
  credentialCleanupTitle: cn('text-[14px] font-medium text-foreground'),
  rowHint: cn('text-[12px] text-muted-foreground leading-[17px]'),
  retryButton: cn('w-18 h-8 rounded-none bg-secondary items-center justify-center'),
  retryButtonText: cn('text-[12px] font-semibold text-foreground'),
  separator: cn('h-hairline bg-border mx-3')
} as const
