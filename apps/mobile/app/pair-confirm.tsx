import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, BackHandler } from 'react-native'

import { CaretLeft as ChevronLeft } from '@/components/uniwind-icons'
import { useSafeAreaInsets } from '@/components/uniwind-native-components'
import { cn } from '@/style/class-names'

import { ConnectionLog } from '../src/components/connection-log'
import { shouldPresentNotificationOptIn } from '../src/notifications/notification-opt-in-gate'
import { spacing } from '../src/theme/uniwind-theme-values'
import { useCloseHost } from '../src/transport/client-context'
import { resolvePairConfirmRouteState } from '../src/transport/pair-confirm-state'
import {
  startPreProfilePairing,
  type PreProfilePairingAttempt
} from '../src/transport/pre-profile-pairing-coordinator'
import type { ConnectionLogEntry } from '../src/transport/types'

type Status = 'awaiting-confirm' | 'connecting' | 'error'

// Why: cap how long the user stares at "Connecting…" during pairing.
// rpc-client retries forever by design (good for live sessions), but for
// the *initial* pair we want a hard ceiling so a half-broken Tailscale
// route surfaces an actionable error with the log visible, instead of
// spinning silently. ~25s allows for one full connect-timeout + a retry.
const PAIRING_OVERALL_TIMEOUT_MS = 25_000

export default function PairConfirmScreen() {
  const router = useRouter()
  const closeHost = useCloseHost()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ code?: string }>()
  const [status, setStatus] = useState<Status>('awaiting-confirm')
  const [errorMessage, setErrorMessage] = useState('')
  const [logs, setLogs] = useState<ConnectionLogEntry[]>([])
  // Why: collect logs in a ref so the rpc-client callback (which closures
  // over the initial state setter) always sees the freshest list and we
  // batch fewer setState calls when entries arrive in bursts.
  const logsRef = useRef<ConnectionLogEntry[]>([])
  const mountedRef = useRef(true)
  const activePairingAttemptRef = useRef<PreProfilePairingAttempt | null>(null)

  const routeState = resolvePairConfirmRouteState(params.code)
  const offer = routeState.offer
  const resolvedStatus =
    status === 'awaiting-confirm' && routeState.kind === 'error' ? 'error' : status
  const resolvedErrorMessage =
    status === 'awaiting-confirm' && routeState.kind === 'error'
      ? routeState.errorMessage
      : errorMessage

  const cancel = useCallback(() => {
    router.replace('/')
  }, [router])

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        cancel()
        return true
      })
      return () => subscription.remove()
    }, [cancel])
  )

  const setPairConfirmRootRef = useCallback((node: View | null): void => {
    if (node !== null) {
      mountedRef.current = true
      return
    }
    // Why: pairing attempts can outlive the visible route; dispose them when
    // the confirm screen detaches without a passive cleanup-only Effect.
    mountedRef.current = false
    activePairingAttemptRef.current?.dispose()
    activePairingAttemptRef.current = null
  }, [])

  async function confirm() {
    if (!offer) {
      return
    }
    setStatus('connecting')
    logsRef.current = []
    setLogs([])
    activePairingAttemptRef.current?.dispose()

    const attempt = startPreProfilePairing({
      offer,
      timeoutMs: PAIRING_OVERALL_TIMEOUT_MS,
      connectOptions: {
        onLog: (entry) => {
          if (!mountedRef.current || activePairingAttemptRef.current !== attempt) {
            return
          }
          logsRef.current = [...logsRef.current, entry]
          setLogs(logsRef.current)
        }
      }
    })
    activePairingAttemptRef.current = attempt
    try {
      const { hostId } = await attempt.result
      const attemptIsCurrent = activePairingAttemptRef.current === attempt
      attempt.dispose()
      if (activePairingAttemptRef.current === attempt) {
        activePairingAttemptRef.current = null
      }
      if (!mountedRef.current || !attemptIsCurrent) {
        return
      }
      // Why: re-pairing the same desktop now reuses its existing host id
      // (STA-1840 dedup), so a client cached under that id from an earlier
      // pairing would keep the stale endpoint/relay. Close it so the
      // destination screen opens a fresh client with the newly-paired
      // profile — the removeHost() path already refreshes on re-pair, and a
      // brand-new host has no cached entry so this is a no-op.
      closeHost(hostId)
      const showNotificationOptIn = await shouldPresentNotificationOptIn()
      if (!mountedRef.current) {
        return
      }
      router.replace(
        showNotificationOptIn
          ? { pathname: '/notification-opt-in', params: { hostId } }
          : `/h/${hostId}`
      )
    } catch (err) {
      const timedOut = attempt.timedOut
      const attemptIsCurrent = activePairingAttemptRef.current === attempt
      attempt.dispose()
      if (activePairingAttemptRef.current === attempt) {
        activePairingAttemptRef.current = null
      }
      if (!mountedRef.current || !attemptIsCurrent) {
        return
      }
      console.warn('[pair-confirm] connect failed', err)
      setStatus('error')
      setErrorMessage(
        timedOut
          ? `Couldn't connect within ${PAIRING_OVERALL_TIMEOUT_MS / 1000}s — see log below for where it stalled`
          : `Pairing failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const containerPadding = { paddingTop: insets.top + spacing.sm }

  return (
    <View ref={setPairConfirmRootRef} className={styles.container} style={[containerPadding]}>
      <Pressable className={styles.backButton} onPress={cancel}>
        <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
      </Pressable>

      <View className={styles.content}>
        {offer && resolvedStatus === 'awaiting-confirm' && (
          <>
            <Text className={styles.title}>Pair with this desktop?</Text>
            <Text className={styles.subtitle}>
              You opened a pairing link from your desktop. Confirm to add it to your hosts.
            </Text>
            <View className={styles.actionStack}>
              <Pressable className={styles.primaryButton} onPress={() => void confirm()}>
                <Text className={styles.primaryButtonText}>Pair</Text>
              </Pressable>
              <Pressable className={styles.secondaryButton} onPress={cancel}>
                <Text className={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </>
        )}

        {resolvedStatus === 'connecting' && (
          <>
            <ActivityIndicator size="large" colorClassName="accent-muted-foreground" />
            <Text className={styles.connectingText}>Connecting…</Text>
            <View className={styles.logSlot}>
              <ConnectionLog entries={logs} title="Pairing log" />
            </View>
          </>
        )}

        {resolvedStatus === 'error' && (
          <>
            <Text className={styles.errorText}>{resolvedErrorMessage}</Text>
            {logs.length > 0 && (
              <View className={styles.logSlot}>
                <ConnectionLog entries={logs} title="Pairing log" />
              </View>
            )}
            <View className={styles.actionStack}>
              <Pressable className={styles.primaryButton} onPress={cancel}>
                <Text className={styles.primaryButtonText}>Back to home</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  )
}

const styles = {
  container: cn('flex-1 bg-background p-4'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mb-2'),
  // Why: nudges the centered group slightly above the geometric
  // middle so the eye reads it as visually centered above the home
  // indicator / nav bar.
  content: cn('flex-1 justify-center px-2 pb-12'),
  title: cn('text-[18px] font-semibold text-foreground mb-2 text-center'),
  subtitle: cn(
    'text-[14px] text-muted-foreground leading-[20px] mb-6 text-center max-w-[520px] self-center'
  ),
  actionStack: cn('w-full max-w-[360px] self-center'),
  primaryButton: cn('w-full bg-foreground px-6 py-2.5 rounded-none items-center mb-2'),
  primaryButtonText: cn('text-background text-[14px] font-semibold'),
  secondaryButton: cn('w-full px-6 py-2.5 rounded-none items-center'),
  secondaryButtonText: cn('text-muted-foreground text-[14px] font-medium'),
  connectingText: cn('text-muted-foreground text-[14px] mt-4 text-center'),
  logSlot: cn('w-full mt-4 mb-3'),
  errorText: cn('text-destructive text-[14px] text-center mb-6 leading-[20px]')
} as const
