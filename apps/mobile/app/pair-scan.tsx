import { useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Linking,
  type LayoutChangeEvent
} from 'react-native'

import { UniwindCameraView } from '@/components/uniwind-camera-view'
import {
  CaretLeft as ChevronLeft,
  Clipboard as ClipboardIcon,
  QrCode
} from '@/components/uniwind-icons'
import { useSafeAreaInsets } from '@/components/uniwind-native-components'
import { cn } from '@/style/class-names'

import { ConnectionLog } from '../src/components/connection-log'
import { TextInputModal } from '../src/components/text-input-modal'
import { shouldPresentNotificationOptIn } from '../src/notifications/notification-opt-in-gate'
import { spacing } from '../src/theme/uniwind-theme-values'
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
      <View className="bg-secondary h-[22px] w-[22px] items-center justify-center">
        <Text className="text-muted-foreground text-xs font-bold">{number}</Text>
      </View>
      <Text className="text-muted-foreground text-sm">{text}</Text>
    </View>
  )
}

export default function PairScanScreen() {
  const router = useRouter()
  const closeHost = useCloseHost()
  const insets = useSafeAreaInsets()
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

  // Why: bottom inset accounts for Android 3-button nav bars and iOS
  // home-indicator areas that would otherwise overlap the 'Or paste
  // pairing code' button at the bottom of the scan screen.
  const containerPadding = {
    paddingTop: insets.top + spacing.sm,
    paddingBottom: insets.bottom + spacing.sm
  }
  // Why: iPad camera previews are often rectangular, but QR guides should
  // stay square so the corners still describe the code shape.
  const reticleSize = Math.min(
    Math.round(Math.min(cameraBounds.width, cameraBounds.height) * SCAN_RETICLE_SCALE),
    SCAN_RETICLE_MAX_SIZE
  )

  if (!permission) {
    return (
      <View ref={setPairScanRootRef} className={styles.container} style={[containerPadding]}>
        <ActivityIndicator colorClassName="accent-muted-foreground" />
      </View>
    )
  }

  if (!permission.granted) {
    const canAskAgain = permission.canAskAgain !== false
    return (
      <View ref={setPairScanRootRef} className={styles.container} style={[containerPadding]}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <View className={styles.centered}>
          <Text className="text-foreground mb-2 text-sm font-semibold">
            {canAskAgain ? 'Pair with desktop' : 'Camera Access Disabled'}
          </Text>
          <Text className="text-muted-foreground mb-6 max-w-[310px] text-center text-sm leading-[20px]">
            {canAskAgain
              ? 'Scan the QR code from Yiru on your desktop, or paste the pairing code instead.'
              : 'Enable camera access in Settings, or paste the pairing code instead.'}
          </Text>
          <Pressable
            className={styles.primaryButton}
            onPress={canAskAgain ? requestPermission : () => void Linking.openSettings()}
          >
            {canAskAgain && <QrCode size={16} colorClassName="accent-primary-foreground" />}
            <Text className={styles.primaryButtonText}>
              {canAskAgain ? 'Continue' : 'Open Settings'}
            </Text>
          </Pressable>
          <Pressable
            className={cn(styles.pasteButton, styles.pasteButtonPressedActive)}
            onPress={() => setPasteVisible(true)}
          >
            <ClipboardIcon size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.pasteButtonText}>Paste code instead</Text>
          </Pressable>
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
    <View ref={setPairScanRootRef} className={styles.container} style={[containerPadding]}>
      <Pressable className={styles.backButton} onPress={() => router.back()}>
        <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
      </Pressable>

      <View className="mb-4 ml-[7px] gap-2">
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
            <View className="flex-1 overflow-hidden" onLayout={handleCameraLayout}>
              <UniwindCameraView
                className="absolute inset-0"
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleBarCodeScanned}
              />
              <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                <View className="relative" style={[{ width: reticleSize, height: reticleSize }]}>
                  <View
                    className={cn(styles.corner, 'top-0 left-0 border-t-[2.5px] border-l-[2.5px]')}
                  />
                  <View
                    className={cn(styles.corner, 'top-0 right-0 border-t-[2.5px] border-r-[2.5px]')}
                  />
                  <View
                    className={cn(
                      styles.corner,
                      'bottom-0 left-0 border-b-[2.5px] border-l-[2.5px]'
                    )}
                  />
                  <View
                    className={cn(
                      styles.corner,
                      'bottom-0 right-0 border-b-[2.5px] border-r-[2.5px]'
                    )}
                  />
                </View>
              </View>
            </View>
          )}
          {/* Why: preserve the camera's layout slot while the paste sheet is open. */}
          {pasteVisible && <View className="bg-card flex-1" />}
          <Pressable
            className={cn(styles.pasteButton, styles.pasteButtonPressedActive)}
            onPress={() => setPasteVisible(true)}
          >
            <ClipboardIcon size={16} colorClassName="accent-muted-foreground" />
            <Text className={styles.pasteButtonText}>Or paste pairing code</Text>
          </Pressable>
        </>
      )}

      {status === 'connecting' && (
        <View className={styles.centered}>
          <ActivityIndicator size="large" colorClassName="accent-muted-foreground" />
          <Text className="text-muted-foreground mt-4 text-sm">Connecting…</Text>
          <View className={styles.logSlot}>
            <ConnectionLog entries={logs} title="Pairing log" />
          </View>
        </View>
      )}

      {status === 'error' && (
        <View className={styles.centered}>
          <Text className="text-destructive mb-6 text-center text-sm leading-[20px]">
            {errorMessage}
          </Text>
          {logs.length > 0 && (
            <View className={styles.logSlot}>
              <ConnectionLog entries={logs} title="Pairing log" />
            </View>
          )}
          <View className="items-center gap-2">
            <Pressable className={styles.primaryButton} onPress={retry}>
              <Text className={styles.primaryButtonText}>Try Again</Text>
            </Pressable>
            <Pressable
              className={cn('px-6 py-2', styles.pasteButtonPressedActive)}
              onPress={() => {
                retry()
                setPasteVisible(true)
              }}
            >
              <Text className="text-muted-foreground text-sm font-medium">Paste code instead</Text>
            </Pressable>
          </View>
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

const styles = {
  container: cn('flex-1 bg-background p-4'),
  backButton: cn('w-9 h-9 items-center justify-center mb-2'),
  corner: cn('absolute w-7 h-7 border-white/70'),
  centered: cn('flex-1 items-center justify-center'),
  logSlot: cn('w-full mt-4 px-2'),
  primaryButton: cn('flex-row items-center justify-center gap-1 bg-primary px-6 py-2.5'),
  primaryButtonText: cn('text-primary-foreground text-sm font-semibold'),
  pasteButton: cn('flex-row items-center justify-center gap-1 mt-3 py-2'),
  pasteButtonPressedActive: cn('active:bg-accent'),
  pasteButtonText: cn('text-muted-foreground text-sm font-medium')
} as const
