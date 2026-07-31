import { useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useState, useRef, useCallback } from 'react'
import { View, Text, ActivityIndicator, Linking, type LayoutChangeEvent } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { UniwindCameraView } from '~/components/uniwind-camera-view'
import { useSafeAreaInsets } from '~/components/uniwind-native-components'
import { resolveCssNumber } from '~/style/resolve-css-variable'

import { ConnectionLog } from '../src/components/connection-log'
import { MobileGlassGroup } from '../src/components/glass/group'
import { MobileGlassTextButton } from '../src/components/glass/text-button'
import { TextInputModal } from '../src/components/text-input-modal'
import { shouldPresentNotificationOptIn } from '../src/notifications/notification-opt-in-gate'
import { useCloseHost } from '../src/transport/client-context'
import { decodePairingUrl, parsePairingCode } from '../src/transport/pairing'
import {
  startPreProfilePairing,
  type PreProfilePairingAttempt
} from '../src/transport/pre-profile-pairing-coordinator'
import type { ConnectionLogEntry, PairingOffer } from '../src/transport/types'

// Why: see pair-confirm.tsx — cap initial-pair "Connecting…" so a broken
// route surfaces as a real error with the log visible instead of a
// silent infinite spinner.
const PAIRING_OVERALL_TIMEOUT_MS = 25_000
const SCAN_RETICLE_SCALE = 0.62
const SCAN_RETICLE_MAX_SIZE = 360

function Step({ number, text }: { number: number; text: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-muted-foreground w-6 text-center text-sm">{number}</Text>
      <Text className="text-muted-foreground text-sm">{text}</Text>
    </View>
  )
}

export default function PairScanScreen() {
  const router = useRouter()
  const closeHost = useCloseHost()
  const insets = useSafeAreaInsets()
  const spacing2 = resolveCssNumber(useCSSVariable('--spacing-2'))
  const [permission, requestPermission] = useCameraPermissions()
  const [status, setStatus] = useState<'scanning' | 'connecting' | 'error'>('scanning')
  const [errorMessage, setErrorMessage] = useState('')
  const [pasteVisible, setPasteVisible] = useState(false)
  const [cameraBounds, setCameraBounds] = useState({ width: 0, height: 0 })
  const [logs, setLogs] = useState<ConnectionLogEntry[]>([])
  const logsRef = useRef<ConnectionLogEntry[]>([])
  const processingRef = useRef(false)
  const mountedRef = useRef(true)
  const activePairingAttemptRef = useRef<PreProfilePairingAttempt | null>(null)

  const setPairScanRootRef = useCallback((node: View | null): void => {
    if (node !== null) {
      mountedRef.current = true
      return
    }
    // Why: pairing attempts can outlive the visible route; dispose them when
    // the scan screen detaches without a passive cleanup-only Effect.
    mountedRef.current = false
    activePairingAttemptRef.current?.dispose()
    activePairingAttemptRef.current = null
  }, [])

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (processingRef.current) {
        return
      }
      processingRef.current = true

      const offer = decodePairingUrl(data)
      if (!offer) {
        setStatus('error')
        setErrorMessage('Not a valid Yiru QR code')
        processingRef.current = false
        return
      }

      void testAndSave(offer)
    },
    [router]
  )

  const handlePasteSubmit = useCallback((input: string) => {
    setPasteVisible(false)
    if (processingRef.current) {
      return
    }
    processingRef.current = true

    const offer = parsePairingCode(input)
    if (!offer) {
      setStatus('error')
      setErrorMessage('Not a valid pairing code — copy it from your computer and paste again')
      processingRef.current = false
      return
    }

    void testAndSave(offer)
  }, [])

  const handleCameraLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    const nextBounds = {
      width: Math.round(width),
      height: Math.round(height)
    }
    setCameraBounds((currentBounds) =>
      currentBounds.width === nextBounds.width && currentBounds.height === nextBounds.height
        ? currentBounds
        : nextBounds
    )
  }, [])

  async function testAndSave(offer: PairingOffer) {
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
      console.warn('[pair] connect failed', err)
      setStatus('error')
      setErrorMessage(
        timedOut
          ? `Couldn't connect within ${PAIRING_OVERALL_TIMEOUT_MS / 1000}s — see log below for where it stalled`
          : `Pairing failed: ${err instanceof Error ? err.message : String(err)}`
      )
      processingRef.current = false
    }
  }

  function retry() {
    setStatus('scanning')
    setErrorMessage('')
    logsRef.current = []
    setLogs([])
    processingRef.current = false
  }

  // Why: the native route header owns the top safe area; only the bottom
  // inset is needed for Android navigation bars and the iOS home indicator.
  const containerPadding = {
    paddingBottom: insets.bottom + spacing2
  }
  // Why: iPad camera previews are often rectangular, but QR guides should
  // stay square so the corners still describe the code shape.
  const reticleSize = Math.min(
    Math.round(Math.min(cameraBounds.width, cameraBounds.height) * SCAN_RETICLE_SCALE),
    SCAN_RETICLE_MAX_SIZE
  )

  if (!permission) {
    return (
      <View
        ref={setPairScanRootRef}
        className="bg-background flex-1 p-4"
        style={[containerPadding]}
      >
        <ActivityIndicator colorClassName="accent-muted-foreground" />
      </View>
    )
  }

  if (!permission.granted) {
    const canAskAgain = permission.canAskAgain !== false
    return (
      <View
        ref={setPairScanRootRef}
        className="bg-background flex-1 p-4"
        style={[containerPadding]}
      >
        <View className="flex-1 items-center justify-center">
          <Text className="text-foreground mb-2 text-sm font-semibold">
            {canAskAgain ? 'Pair with desktop' : 'Camera Access Disabled'}
          </Text>
          <Text className="text-muted-foreground mb-6 max-w-80 text-center text-sm leading-5">
            {canAskAgain
              ? 'Scan the QR code from Yiru on your desktop, or paste the pairing code instead.'
              : 'Enable camera access in Settings, or paste the pairing code instead.'}
          </Text>
          <MobileGlassGroup className="gap-2" spacing={8}>
            <MobileGlassTextButton
              isProminent
              label={canAskAgain ? 'Continue' : 'Open Settings'}
              onPress={canAskAgain ? requestPermission : () => void Linking.openSettings()}
              size="large"
            />
            <MobileGlassTextButton
              label="Paste code instead"
              onPress={() => setPasteVisible(true)}
              size="large"
            />
          </MobileGlassGroup>
        </View>
        <TextInputModal
          visible={pasteVisible}
          title="Paste pairing code"
          message="Copy the code shown under the QR on your computer."
          placeholder="yiru://pair?code=... or paste the code"
          onSubmit={handlePasteSubmit}
          onCancel={() => setPasteVisible(false)}
        />
      </View>
    )
  }

  return (
    <View ref={setPairScanRootRef} className="bg-background flex-1 p-4" style={[containerPadding]}>
      <View className="mb-4 gap-2">
        <Step number={1} text="Open Yiru on your computer" />
        <Step number={2} text="Go to Settings → Mobile" />
        <Step number={3} text="Scan the QR code" />
      </View>

      {status === 'scanning' && (
        <>
          {/* Why: unmount the camera while the paste sheet is open. The
              user has clearly chosen the paste path; keeping the camera
              streaming behind a sheet wastes power and looks weird if
              they cancel the sheet and the QR was scanned silently in
              the meantime. */}
          {!pasteVisible && (
            <View className="flex-1 overflow-hidden rounded-3xl" onLayout={handleCameraLayout}>
              <UniwindCameraView
                className="absolute inset-0"
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleBarCodeScanned}
              />
              <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                <View className="relative" style={[{ width: reticleSize, height: reticleSize }]}>
                  <View className="border-camera-reticle absolute top-0 left-0 h-7 w-7 border-t-2 border-l-2" />
                  <View className="border-camera-reticle absolute top-0 right-0 h-7 w-7 border-t-2 border-r-2" />
                  <View className="border-camera-reticle absolute bottom-0 left-0 h-7 w-7 border-b-2 border-l-2" />
                  <View className="border-camera-reticle absolute right-0 bottom-0 h-7 w-7 border-r-2 border-b-2" />
                </View>
              </View>
            </View>
          )}
          {/* Why: preserve the camera's layout slot while the paste sheet is open. */}
          {pasteVisible && <View className="bg-background flex-1 rounded-3xl" />}
          <MobileGlassTextButton
            className="mt-3 self-center"
            label="Or paste pairing code"
            onPress={() => setPasteVisible(true)}
          />
        </>
      )}

      {status === 'connecting' && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" colorClassName="accent-muted-foreground" />
          <Text className="text-muted-foreground mt-4 text-sm">Connecting…</Text>
          <View className="mt-4 w-full px-2">
            <ConnectionLog entries={logs} title="Pairing log" />
          </View>
        </View>
      )}

      {status === 'error' && (
        <View className="flex-1 items-center justify-center">
          <Text className="text-destructive mb-6 text-center text-sm leading-5">
            {errorMessage}
          </Text>
          {logs.length > 0 && (
            <View className="mt-4 w-full px-2">
              <ConnectionLog entries={logs} title="Pairing log" />
            </View>
          )}
          <MobileGlassGroup className="items-center gap-2" spacing={8}>
            <MobileGlassTextButton isProminent label="Try Again" onPress={retry} size="large" />
            <MobileGlassTextButton
              label="Paste code instead"
              onPress={() => {
                retry()
                setPasteVisible(true)
              }}
              size="large"
            />
          </MobileGlassGroup>
        </View>
      )}

      <TextInputModal
        visible={pasteVisible}
        title="Paste pairing code"
        message="Copy the code shown under the QR on your computer."
        placeholder="yiru://pair?code=... or paste the code"
        onSubmit={handlePasteSubmit}
        onCancel={() => setPasteVisible(false)}
      />
    </View>
  )
}
