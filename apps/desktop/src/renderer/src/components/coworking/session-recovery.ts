import type React from 'react'

import { selectCoworkingCanControl } from '@/components/coworking/selectors'
import { useAppStore } from '@/store'

import type { CoworkingSessionCatalogEntry } from '../../../../shared/coworking/catalog-contract'
import type { CoworkingRequesterTransportErrorCode } from '../../../../shared/coworking/ipc-contract'
import type { CoworkingSessionPanePhase as SessionPanePhase } from './session-continuation-notice'
import type { CoworkingSessionRoute } from './session-route'
import { isRecoverableCoworkingTerminalError } from './use-terminal-reconnect'

export type ContinuationState =
  | 'not-started'
  | 'pending'
  | 'attached'
  | 'outcome-unknown'
  | 'awaiting-historical'
  | 'reconnect-only'

const UNKNOWN_ATTACH_RETRY_MS = [100, 250, 500, 1_000, 2_000, 4_000, 8_000] as const

type UnknownAttachmentRecoveryContext = {
  unknownRetryRef: React.MutableRefObject<number>
  retryTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  terminalLiveRef: React.MutableRefObject<boolean>
  clearRetryTimer: () => void
  setPhase: (phase: SessionPanePhase) => void
  setTerminalAttempt: (updater: (attempt: number) => number) => void
}

// Why: an uncertain continuation retries on a capped backoff ladder rather
// than forever, so a stuck owner desktop eventually surfaces as an error.
export function scheduleCoworkingUnknownAttachment(
  context: UnknownAttachmentRecoveryContext
): void {
  const {
    unknownRetryRef,
    retryTimerRef,
    terminalLiveRef,
    clearRetryTimer,
    setPhase,
    setTerminalAttempt
  } = context
  clearRetryTimer()
  const delay = UNKNOWN_ATTACH_RETRY_MS[unknownRetryRef.current]
  if (delay === undefined) {
    setPhase('attach-error')
    return
  }
  unknownRetryRef.current += 1
  setPhase('attaching')
  retryTimerRef.current = setTimeout(() => {
    retryTimerRef.current = null
    terminalLiveRef.current = false
    setTerminalAttempt((attempt) => attempt + 1)
  }, delay)
}

type SubscriptionErrorRecoveryContext = {
  code: CoworkingRequesterTransportErrorCode | null
  route: CoworkingSessionRoute
  continuationRef: React.MutableRefObject<ContinuationState>
  terminalLiveRef: React.MutableRefObject<boolean>
  clearRetryTimer: () => void
  setPhase: (phase: SessionPanePhase) => void
  startReconnect: () => void
  retryReconnect: () => void
  continueSession: () => Promise<void>
  scheduleUnknownAttachment: () => void
}

// Why: a dropped transport does not prove the agent exited, so recovery must
// distinguish "resubscribe" from "re-run session.continue" by the phase the
// pane was in when the subscription failed — this policy owns that mapping
// independent of the effects that keep the pane in sync with the catalog.
export function recoverFromCoworkingSubscriptionError(
  context: SubscriptionErrorRecoveryContext
): void {
  const {
    code,
    route,
    continuationRef,
    terminalLiveRef,
    clearRetryTimer,
    setPhase,
    startReconnect,
    retryReconnect,
    continueSession,
    scheduleUnknownAttachment
  } = context
  if (terminalLiveRef.current) {
    clearRetryTimer()
    terminalLiveRef.current = false
    continuationRef.current = 'reconnect-only'
    if (isRecoverableCoworkingTerminalError(code, true)) {
      startReconnect()
    } else {
      setPhase('reconnect-error')
    }
    return
  }
  if (code !== 'resource_not_found') {
    const recoverable = isRecoverableCoworkingTerminalError(code)
    const recoverOrFail = (recover: () => void): void => {
      if (recoverable) {
        recover()
      } else {
        setPhase('reconnect-error')
      }
    }
    if (continuationRef.current === 'attached' || continuationRef.current === 'outcome-unknown') {
      clearRetryTimer()
      setPhase('attach-error')
    } else if (continuationRef.current === 'reconnect-only') {
      clearRetryTimer()
      recoverOrFail(retryReconnect)
    } else if (continuationRef.current === 'not-started') {
      clearRetryTimer()
      continuationRef.current = 'reconnect-only'
      setPhase('reconnect-error')
    } else if (continuationRef.current === 'awaiting-historical') {
      clearRetryTimer()
      continuationRef.current = 'reconnect-only'
      recoverOrFail(startReconnect)
    }
    return
  }
  switch (continuationRef.current) {
    case 'not-started':
      if (selectCoworkingCanControl(useAppStore.getState(), route)) {
        void continueSession()
      } else {
        setPhase('waiting-control')
      }
      return
    case 'pending':
      return
    case 'attached':
      setPhase('attach-error')
      return
    case 'outcome-unknown':
      scheduleUnknownAttachment()
      return
    case 'awaiting-historical':
      continuationRef.current = 'not-started'
      if (selectCoworkingCanControl(useAppStore.getState(), route)) {
        void continueSession()
      } else {
        setPhase('waiting-control')
      }
      return
    case 'reconnect-only':
      retryReconnect()
  }
}

type SessionCloseRecoveryContext = {
  canContinue: boolean
  continuationRef: React.MutableRefObject<ContinuationState>
  terminalLiveRef: React.MutableRefObject<boolean>
  catalogSessionRef: React.MutableRefObject<CoworkingSessionCatalogEntry | null>
  setClosedCatalogSession: (session: CoworkingSessionCatalogEntry | null) => void
  clearRetryTimer: () => void
  resetReconnect: () => void
  setPhase: (phase: SessionPanePhase) => void
}

// Why: only a genuine PTY exit may offer another continuation — this policy
// owns telling a real close apart from a dropped-but-still-live transport.
export function recoverFromCoworkingSessionClose(context: SessionCloseRecoveryContext): void {
  const {
    canContinue,
    continuationRef,
    terminalLiveRef,
    catalogSessionRef,
    setClosedCatalogSession,
    clearRetryTimer,
    resetReconnect,
    setPhase
  } = context
  resetReconnect()
  if (terminalLiveRef.current) {
    clearRetryTimer()
    terminalLiveRef.current = false
    if (canContinue) {
      continuationRef.current = 'not-started'
      setClosedCatalogSession(catalogSessionRef.current)
      setPhase('closed')
    } else if (continuationRef.current === 'not-started') {
      setPhase('ended')
    }
    return
  }
  if (continuationRef.current === 'not-started' && canContinue) {
    clearRetryTimer()
    setClosedCatalogSession(catalogSessionRef.current)
    setPhase('closed')
    return
  }
  if (continuationRef.current === 'awaiting-historical') {
    clearRetryTimer()
    continuationRef.current = 'not-started'
    setClosedCatalogSession(catalogSessionRef.current)
    setPhase(canContinue ? 'closed' : 'ended')
    return
  }
  if (continuationRef.current === 'reconnect-only') {
    clearRetryTimer()
    continuationRef.current = 'not-started'
    if (canContinue) {
      setClosedCatalogSession(catalogSessionRef.current)
    }
    setPhase(canContinue ? 'closed' : 'ended')
    return
  }
  if (continuationRef.current === 'attached' || continuationRef.current === 'outcome-unknown') {
    clearRetryTimer()
    setPhase('attach-error')
  }
}

// Why: a missing or malformed session.continue response can still mean the
// agent launched, so recovery must attach rather than trust an empty result.
export function isContinuedSessionResult(value: unknown, sessionRef: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const result = value as Record<string, unknown>
  return Object.keys(result).length === 1 && result.sessionRef === sessionRef
}

// Why: an in-flight continuation must keep its pane mounted even after the
// catalog stops reporting the session, or the outcome it is chasing is lost.
export function retainsMissingHistoricalContinuation(state: ContinuationState): boolean {
  return (
    state === 'pending' ||
    state === 'attached' ||
    state === 'outcome-unknown' ||
    state === 'awaiting-historical'
  )
}
