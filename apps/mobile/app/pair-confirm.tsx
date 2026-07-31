import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, BackHandler } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { ConnectionLog } from '~/components/connection-log'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { useSafeAreaInsets } from '~/components/uniwind-native-components'
import { shouldPresentNotificationOptIn } from '~/notifications/notification-opt-in-gate'
import { resolveCssNumber } from '~/style/resolve-css-variable'
import { useCloseHost } from '~/transport/client-context'
import { resolvePairConfirmRouteState } from '~/transport/pair-confirm-state'
import {
  startPreProfilePairing,
  type PreProfilePairingAttempt
} from '~/transport/pre-profile-pairing-coordinator'
import type { ConnectionLogEntry } from '~/transport/types'

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
  const spacing2 = resolveCssNumber(useCSSVariable('--spacing-2'))
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

  const containerPadding = { paddingTop: insets.top + spacing2 }

  return (
    <View
      ref={setPairConfirmRootRef}
      className="bg-background flex-1 p-4"
      style={[containerPadding]}
    >
      <MobileGlassIconButton accessibilityLabel="Cancel pairing" icon="back" onPress={cancel} />

      {/* Why: the bottom padding makes the group look centered above the home indicator. */}
      <View className="flex-1 justify-center px-2 pb-12">
        {offer && resolvedStatus === 'awaiting-confirm' && (
          <>
            <Text className="text-foreground mb-2 text-center text-sm font-semibold">
              Pair with this desktop?
            </Text>
            <Text className="text-muted-foreground mb-6 max-w-lg self-center text-center text-sm leading-5">
              You opened a pairing link from your desktop. Confirm to add it to your hosts.
            </Text>
            <MobileGlassGroup className="w-full max-w-sm gap-2 self-center" spacing={8}>
              <MobileGlassTextButton
                isFullWidth
                isProminent
                label="Pair"
                onPress={() => void confirm()}
                size="large"
              />
              <MobileGlassTextButton isFullWidth label="Cancel" onPress={cancel} size="large" />
            </MobileGlassGroup>
          </>
        )}

        {resolvedStatus === 'connecting' && (
          <>
            <ActivityIndicator size="large" colorClassName="accent-muted-foreground" />
            <Text className="text-muted-foreground mt-4 text-center text-sm">Connecting…</Text>
            <View className="mt-4 mb-3 w-full">
              <ConnectionLog entries={logs} title="Pairing log" />
            </View>
          </>
        )}

        {resolvedStatus === 'error' && (
          <>
            <Text className="text-destructive mb-6 text-center text-sm leading-5">
              {resolvedErrorMessage}
            </Text>
            {logs.length > 0 && (
              <View className="mt-4 mb-3 w-full">
                <ConnectionLog entries={logs} title="Pairing log" />
              </View>
            )}
            <View className="w-full max-w-sm self-center">
              <MobileGlassTextButton
                isFullWidth
                isProminent
                label="Back to home"
                onPress={cancel}
                size="large"
              />
            </View>
          </>
        )}
      </View>
    </View>
  )
}
