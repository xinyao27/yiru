import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { ArrowClockwise as RefreshCw } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

export type NativeWebViewEngineEvent = {
  readonly nativeEvent?: object
}

type TerminalWebViewEngineErrorOverlayProps = {
  readonly message: string
  readonly onReload: () => void
}

type NativeWebViewEngineFields = {
  readonly description?: unknown
  readonly code?: unknown
  readonly statusCode?: unknown
  readonly domain?: unknown
  readonly didCrash?: unknown
}

export function useTerminalWebViewEngineErrorState(onEngineError?: (message: string) => void) {
  const [engineError, setEngineError] = useState<string | null>(null)
  const clearEngineError = useCallback(() => setEngineError(null), [])
  const reportEngineError = useCallback(
    (message: string, fatal: boolean) => {
      onEngineError?.(message)
      // eslint-disable-next-line no-console
      console.warn('[terminal-webview] engine error', message)
      if (fatal) {
        // Why: the first fatal report is the root cause; later cascades (e.g. the
        // web-ready watchdog firing after a process-crash report) must not
        // overwrite its more specific diagnostics. clearEngineError resets.
        setEngineError((previous) => previous ?? message)
      }
    },
    [onEngineError]
  )
  const reportNativeEngineError = useCallback(
    (context: string, event?: NativeWebViewEngineEvent) => {
      reportEngineError(describeNativeWebViewEngineError(context, event), true)
    },
    [reportEngineError]
  )
  return { clearEngineError, engineError, reportEngineError, reportNativeEngineError }
}

export function describeNativeWebViewEngineError(
  context: string,
  event?: NativeWebViewEngineEvent
): string {
  const native = event?.nativeEvent as NativeWebViewEngineFields | undefined
  const parts = [context]
  const description = native?.description
  const statusCode = native?.statusCode
  const code = native?.code
  const domain = native?.domain
  if (typeof description === 'string') {
    parts.push(description)
  }
  if (typeof statusCode === 'number') {
    parts.push(`status ${statusCode}`)
  }
  if (typeof code === 'number') {
    parts.push(`code ${code}`)
  }
  if (typeof domain === 'string') {
    parts.push(domain)
  }
  if (native?.didCrash === true) {
    parts.push('renderer crashed')
  }
  return parts.join(' - ')
}

export function TerminalWebViewEngineErrorOverlay({
  message,
  onReload
}: TerminalWebViewEngineErrorOverlayProps) {
  return (
    <View className={styles.errorOverlay}>
      <Text className={styles.errorTitle}>Terminal failed to load</Text>
      <Text className={styles.errorDetail} numberOfLines={4}>
        {message}
      </Text>
      <Pressable accessibilityRole="button" className={styles.reloadButton} onPress={onReload}>
        <RefreshCw size={16} colorClassName="accent-primary-foreground" />
        <Text className={styles.reloadButtonText}>Reload</Text>
      </Pressable>
    </View>
  )
}

const styles = {
  errorOverlay: cn(
    'absolute inset-0 items-center justify-center gap-3 p-6 bg-[var(--terminal-background)]'
  ),
  errorTitle: cn('text-foreground text-[16px] font-bold text-center'),
  errorDetail: cn('text-muted-foreground text-[13px] leading-[18px] text-center'),
  reloadButton: cn('flex-row items-center gap-2 min-h-9 px-3.5 rounded-none bg-primary'),
  reloadButtonText: cn('text-primary-foreground text-[14px] font-bold')
} as const
