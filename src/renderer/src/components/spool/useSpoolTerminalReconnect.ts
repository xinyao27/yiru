import { useCallback, useEffect, useRef } from 'react'
import type { SpoolRequesterTransportErrorCode } from '../../../../shared/spool/spool-ipc-contract'

const TERMINAL_RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000] as const
const RECOVERABLE_TERMINAL_ERRORS: ReadonlySet<SpoolRequesterTransportErrorCode> = new Set([
  'disconnected',
  'timeout',
  'resource_busy',
  'resource_unavailable',
  'internal_error'
])

type SpoolTerminalReconnectOptions = {
  isCurrent: () => boolean
  onPending: () => void
  onAttempt: () => void
}

/** Runs capped-backoff read-only reattachments without replaying terminal mutations. */
export function useSpoolTerminalReconnect(options: SpoolTerminalReconnectOptions): {
  startReconnect: () => void
  retryReconnect: () => void
  resetReconnect: () => void
} {
  const optionsRef = useRef(options)
  const retryAttemptRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  optionsRef.current = options

  const clearTimer = useCallback((): void => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  const resetReconnect = useCallback((): void => {
    clearTimer()
    retryAttemptRef.current = 0
  }, [clearTimer])

  const startReconnect = useCallback((): void => {
    resetReconnect()
    const current = optionsRef.current
    if (!current.isCurrent()) {
      return
    }
    current.onPending()
    current.onAttempt()
  }, [resetReconnect])

  const retryReconnect = useCallback((): void => {
    if (retryTimerRef.current) {
      return
    }
    const current = optionsRef.current
    if (!current.isCurrent()) {
      return
    }
    const delay =
      TERMINAL_RECONNECT_DELAYS_MS[
        Math.min(retryAttemptRef.current, TERMINAL_RECONNECT_DELAYS_MS.length - 1)
      ]
    // Why: reattachment is read-only and scoped to the active route, so a long
    // network outage should wait at the cap instead of requiring manual recovery.
    retryAttemptRef.current = Math.min(
      retryAttemptRef.current + 1,
      TERMINAL_RECONNECT_DELAYS_MS.length - 1
    )
    current.onPending()
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      const latest = optionsRef.current
      if (latest.isCurrent()) {
        latest.onAttempt()
      }
    }, delay)
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  return { startReconnect, retryReconnect, resetReconnect }
}

export function isRecoverableSpoolTerminalError(
  code: SpoolRequesterTransportErrorCode | null,
  allowResourceNotFound = false
): boolean {
  // Why: a previously live alias may briefly disappear while its actual-host route recovers.
  return (
    (allowResourceNotFound && code === 'resource_not_found') ||
    (code !== null && RECOVERABLE_TERMINAL_ERRORS.has(code))
  )
}
