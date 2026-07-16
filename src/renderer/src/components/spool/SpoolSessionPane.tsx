import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import type { SpoolRequesterTransportErrorCode } from '../../../../shared/spool/spool-ipc-contract'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  resolveSpoolWorkspaceRoute,
  selectSpoolCanControl
} from '@/store/slices/spool-sharing-selectors'
import { SpoolTerminalPane } from './SpoolTerminalPane'
import {
  SpoolSessionContinuationNotice,
  type SpoolSessionPanePhase as SessionPanePhase
} from './SpoolSessionContinuationNotice'
import { getSpoolRequesterTransportErrorCode } from './spool-requester-error'
import { isSameSpoolSessionRoute, type SpoolSessionRoute } from './spool-session-route'
import {
  isRecoverableSpoolTerminalError,
  useSpoolTerminalReconnect
} from './useSpoolTerminalReconnect'

type ContinuationState =
  | 'not-started'
  | 'pending'
  | 'attached'
  | 'outcome-unknown'
  | 'awaiting-historical'
  | 'reconnect-only'
const UNKNOWN_ATTACH_RETRY_MS = [100, 250, 500, 1_000, 2_000, 4_000, 8_000] as const

export function SpoolSessionPane({
  route,
  retainMissingSession = false,
  focusRequested = false,
  onFocusHandled
}: {
  route: SpoolSessionRoute
  retainMissingSession?: boolean
  focusRequested?: boolean
  onFocusHandled?: (sessionRef: string) => void
}): React.JSX.Element {
  const canControl = useAppStore((state) => selectSpoolCanControl(state, route))
  const { catalogSession, sessionCatalogStatus } = useAppStore(
    useShallow((state) => {
      const workspace = resolveSpoolWorkspaceRoute(state, route)
      return {
        catalogSession: workspace?.session ?? null,
        sessionCatalogStatus: workspace?.worktree.sessionCatalog.status ?? null
      }
    })
  )
  const setActiveRoute = useAppStore((state) => state.setActiveSpoolWorkspaceRoute)
  const [phase, setPhase] = useState<SessionPanePhase>('terminal')
  const [terminalAttempt, setTerminalAttempt] = useState(0)
  const continuationRef = useRef<ContinuationState>('not-started')
  const terminalLiveRef = useRef(false)
  const unknownRetryRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const catalogSessionRef = useRef(catalogSession)
  const unknownCatalogSessionRef = useRef(catalogSession)
  const closedCatalogSessionRef = useRef(catalogSession)
  catalogSessionRef.current = catalogSession

  const { startReconnect, retryReconnect, resetReconnect } = useSpoolTerminalReconnect({
    isCurrent: () =>
      isSameSpoolSessionRoute(useAppStore.getState().activeSpoolWorkspaceRoute, route),
    onPending: () => setPhase('attaching'),
    onAttempt: () => {
      terminalLiveRef.current = false
      setTerminalAttempt((attempt) => attempt + 1)
    },
    onExhausted: () => setPhase('reconnect-error')
  })

  const clearRetryTimer = useCallback((): void => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  const attachAfterUncertainContinue = useCallback((): void => {
    clearRetryTimer()
    // Why: a mutation with a missing or malformed response may still have
    // launched the agent, so recovery can only attach and must never relaunch.
    continuationRef.current = 'outcome-unknown'
    unknownCatalogSessionRef.current = catalogSessionRef.current
    terminalLiveRef.current = false
    unknownRetryRef.current = 0
    setPhase('attaching')
    setTerminalAttempt((attempt) => attempt + 1)
    toast.warning(
      translate(
        'auto.components.spool.SpoolSessionPane.continueOutcomeUnknown',
        'The agent may have started on the owner’s desktop. Reconnecting to its terminal without starting it again.'
      )
    )
  }, [clearRetryTimer])

  const continueSession = useCallback(async (): Promise<void> => {
    if (
      continuationRef.current !== 'not-started' ||
      !selectSpoolCanControl(useAppStore.getState(), route)
    ) {
      return
    }
    continuationRef.current = 'pending'
    setPhase('continuing')
    try {
      const value = await window.api.spoolSharing.invoke({
        desktopRef: route.desktopRef,
        connectionEpoch: route.connectionEpoch,
        method: 'session.continue',
        params: { sessionRef: route.sessionRef }
      })
      if (!isSameSpoolSessionRoute(useAppStore.getState().activeSpoolWorkspaceRoute, route)) {
        return
      }
      if (!isContinuedSessionResult(value, route.sessionRef)) {
        attachAfterUncertainContinue()
        return
      }
      continuationRef.current = 'attached'
      terminalLiveRef.current = false
      setPhase('attaching')
      setTerminalAttempt((attempt) => attempt + 1)
    } catch (error) {
      if (!isSameSpoolSessionRoute(useAppStore.getState().activeSpoolWorkspaceRoute, route)) {
        return
      }
      if (getSpoolRequesterTransportErrorCode(error) === 'outcome_unknown') {
        attachAfterUncertainContinue()
        return
      }
      continuationRef.current = 'not-started'
      setPhase(
        selectSpoolCanControl(useAppStore.getState(), route) ? 'continue-error' : 'waiting-control'
      )
    }
  }, [attachAfterUncertainContinue, route])

  useEffect(() => {
    if (phase === 'waiting-control' && canControl) {
      void continueSession()
    }
  }, [canControl, continueSession, phase])

  useEffect(() => clearRetryTimer, [clearRetryTimer])

  useEffect(() => {
    if (
      catalogSession ||
      // Why: terminal.create returns an attachable alias before paged
      // inventory can publish it; that handoff must keep its route mounted.
      retainMissingSession ||
      sessionCatalogStatus === null ||
      sessionCatalogStatus === 'loading' ||
      retainsMissingHistoricalContinuation(continuationRef.current)
    ) {
      return
    }
    if (!isSameSpoolSessionRoute(useAppStore.getState().activeSpoolWorkspaceRoute, route)) {
      return
    }
    // Why: completed pagination is authoritative for ordinary aliases; keeping
    // a missing ref mounted leaves a terminal that can render but cannot accept input.
    setActiveRoute({
      desktopRef: route.desktopRef,
      worktreeRef: route.worktreeRef,
      connectionEpoch: route.connectionEpoch
    })
  }, [catalogSession, phase, retainMissingSession, route, sessionCatalogStatus, setActiveRoute])

  useEffect(() => {
    if (
      !catalogSession ||
      catalogSession === unknownCatalogSessionRef.current ||
      continuationRef.current !== 'outcome-unknown'
    ) {
      return
    }
    // Why: paired fallback can outlive the timer budget while a legal paged
    // inventory rebuilds; a fresh projected alias is the authoritative retry signal.
    unknownCatalogSessionRef.current = catalogSession
    clearRetryTimer()
    terminalLiveRef.current = false
    setPhase('attaching')
    setTerminalAttempt((attempt) => attempt + 1)
  }, [catalogSession, clearRetryTimer])

  useEffect(() => {
    if (
      !catalogSession ||
      catalogSession === closedCatalogSessionRef.current ||
      continuationRef.current !== 'awaiting-historical'
    ) {
      return
    }
    // Why: a genuine close must wait for the stable alias to be reprojected
    // before probing whether it is now a historical provider session.
    closedCatalogSessionRef.current = catalogSession
    terminalLiveRef.current = false
    setTerminalAttempt((attempt) => attempt + 1)
  }, [catalogSession])

  const scheduleUnknownAttachment = useCallback((): void => {
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
  }, [clearRetryTimer])

  const handleSubscriptionError = useCallback(
    (code: SpoolRequesterTransportErrorCode | null): void => {
      if (terminalLiveRef.current) {
        // Why: transport loss does not prove the agent exited; recovery may
        // only resubscribe and must never invoke provider continuation.
        clearRetryTimer()
        terminalLiveRef.current = false
        continuationRef.current = 'reconnect-only'
        if (isRecoverableSpoolTerminalError(code, true)) {
          startReconnect()
        } else {
          setPhase('reconnect-error')
        }
        return
      }
      if (code !== 'resource_not_found') {
        const recoverable = isRecoverableSpoolTerminalError(code)
        const recoverOrFail = (recover: () => void): void => {
          if (recoverable) {
            recover()
          } else {
            setPhase('reconnect-error')
          }
        }
        if (
          continuationRef.current === 'attached' ||
          continuationRef.current === 'outcome-unknown'
        ) {
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
          if (selectSpoolCanControl(useAppStore.getState(), route)) {
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
          if (selectSpoolCanControl(useAppStore.getState(), route)) {
            void continueSession()
          } else {
            setPhase('waiting-control')
          }
          return
        case 'reconnect-only':
          retryReconnect()
      }
    },
    [
      clearRetryTimer,
      continueSession,
      retryReconnect,
      route,
      scheduleUnknownAttachment,
      startReconnect
    ]
  )

  const handleLive = useCallback((): void => {
    clearRetryTimer()
    resetReconnect()
    terminalLiveRef.current = true
    unknownRetryRef.current = 0
    if (continuationRef.current === 'outcome-unknown') {
      continuationRef.current = 'attached'
    } else if (continuationRef.current === 'awaiting-historical') {
      continuationRef.current = 'not-started'
    } else if (continuationRef.current === 'reconnect-only') {
      continuationRef.current = 'not-started'
    }
    setPhase('terminal')
  }, [clearRetryTimer, resetReconnect])

  const handleFocus = useCallback((): void => {
    onFocusHandled?.(route.sessionRef)
  }, [onFocusHandled, route.sessionRef])

  const handleClosed = useCallback(
    (canContinue: boolean): void => {
      resetReconnect()
      if (terminalLiveRef.current) {
        clearRetryTimer()
        terminalLiveRef.current = false
        if (canContinue) {
          // Why: only an owner-confirmed provider session can safely expose
          // another continuation after a genuine PTY exit.
          continuationRef.current = 'not-started'
          closedCatalogSessionRef.current = catalogSessionRef.current
          setPhase('closed')
        } else if (continuationRef.current === 'not-started') {
          setPhase('ended')
        }
        return
      }
      if (continuationRef.current === 'not-started' && canContinue) {
        clearRetryTimer()
        closedCatalogSessionRef.current = catalogSessionRef.current
        setPhase('closed')
        return
      }
      if (continuationRef.current === 'awaiting-historical') {
        clearRetryTimer()
        continuationRef.current = 'not-started'
        closedCatalogSessionRef.current = catalogSessionRef.current
        setPhase(canContinue ? 'closed' : 'ended')
        return
      }
      if (continuationRef.current === 'reconnect-only') {
        clearRetryTimer()
        continuationRef.current = 'not-started'
        if (canContinue) {
          closedCatalogSessionRef.current = catalogSessionRef.current
        }
        setPhase(canContinue ? 'closed' : 'ended')
        return
      }
      if (continuationRef.current === 'attached' || continuationRef.current === 'outcome-unknown') {
        clearRetryTimer()
        setPhase('attach-error')
      }
    },
    [clearRetryTimer, resetReconnect]
  )

  const retry = (): void => {
    clearRetryTimer()
    if (phase === 'continue-error') {
      continuationRef.current = 'not-started'
      void continueSession()
      return
    }
    if (phase === 'closed') {
      unknownRetryRef.current = 0
      terminalLiveRef.current = false
      continuationRef.current = 'awaiting-historical'
      setPhase('attaching')
      const currentSession = catalogSessionRef.current
      if (currentSession && currentSession !== closedCatalogSessionRef.current) {
        closedCatalogSessionRef.current = currentSession
        setTerminalAttempt((attempt) => attempt + 1)
      }
      return
    }
    if (continuationRef.current === 'reconnect-only') {
      startReconnect()
      return
    }
    unknownRetryRef.current = 0
    terminalLiveRef.current = false
    setPhase('attaching')
    setTerminalAttempt((attempt) => attempt + 1)
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <SpoolTerminalPane
        key={terminalAttempt}
        route={route}
        focusRequested={focusRequested}
        onFocusHandled={handleFocus}
        onSubscriptionError={handleSubscriptionError}
        onLive={handleLive}
        onClosed={handleClosed}
      />
      {phase !== 'terminal' ? (
        <SpoolSessionContinuationNotice phase={phase} canControl={canControl} onRetry={retry} />
      ) : null}
    </div>
  )
}

function isContinuedSessionResult(value: unknown, sessionRef: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const result = value as Record<string, unknown>
  return Object.keys(result).length === 1 && result.sessionRef === sessionRef
}

function retainsMissingHistoricalContinuation(state: ContinuationState): boolean {
  return (
    state === 'pending' ||
    state === 'attached' ||
    state === 'outcome-unknown' ||
    state === 'awaiting-historical'
  )
}
