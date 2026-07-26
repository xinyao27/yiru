import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'

import {
  resolveCoworkingWorkspaceRoute,
  selectCoworkingCanControl
} from '@/components/coworking/selectors'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import type { CoworkingRequesterTransportErrorCode } from '../../../../shared/coworking/ipc-contract'
import { getCoworkingRequesterTransportErrorCode } from './requester-error'
import type { CoworkingSessionPanePhase as SessionPanePhase } from './session-continuation-notice'
import {
  isContinuedSessionResult,
  recoverFromCoworkingSessionClose,
  recoverFromCoworkingSubscriptionError,
  retainsMissingHistoricalContinuation,
  scheduleCoworkingUnknownAttachment,
  type ContinuationState
} from './session-recovery'
import { isSameCoworkingSessionRoute, type CoworkingSessionRoute } from './session-route'
import { useCoworkingTerminalReconnect } from './use-terminal-reconnect'

export type CoworkingSessionContinuation = {
  phase: SessionPanePhase
  canControl: boolean
  terminalAttempt: number
  handleSubscriptionError: (code: CoworkingRequesterTransportErrorCode | null) => void
  handleLive: () => void
  handleClosed: (canContinue: boolean) => void
  retry: () => void
}

// Why: the pane must reattach to an already-running agent rather than relaunch
// it whenever a mutation's outcome is uncertain, and must keep its mounted
// route aligned with the session catalog — this hook owns that lifecycle so
// the pane component only wires the result to the terminal and the notice.
export function useCoworkingSessionContinuation(
  route: CoworkingSessionRoute,
  retainMissingSession: boolean
): CoworkingSessionContinuation {
  const canControl = useAppStore((state) => selectCoworkingCanControl(state, route))
  const { catalogSession, sessionCatalogStatus } = useAppStore(
    useShallow((state) => {
      const workspace = resolveCoworkingWorkspaceRoute(state, route)
      return {
        catalogSession: workspace?.session ?? null,
        sessionCatalogStatus: workspace?.worktree.sessionCatalog.status ?? null
      }
    })
  )
  const setActiveRoute = useAppStore((state) => state.setActiveCoworkingWorkspaceRoute)
  const [phase, setPhase] = useState<SessionPanePhase>('terminal')
  const [terminalAttempt, setTerminalAttempt] = useState(0)
  const continuationRef = useRef<ContinuationState>('not-started')
  const terminalLiveRef = useRef(false)
  const unknownRetryRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const catalogSessionRef = useRef(catalogSession)
  const [unknownCatalogSession, setUnknownCatalogSession] = useState(catalogSession)
  const [closedCatalogSession, setClosedCatalogSession] = useState(catalogSession)
  catalogSessionRef.current = catalogSession

  const { startReconnect, retryReconnect, resetReconnect } = useCoworkingTerminalReconnect({
    isCurrent: () =>
      isSameCoworkingSessionRoute(useAppStore.getState().activeCoworkingWorkspaceRoute, route),
    onPending: () => setPhase('attaching'),
    onAttempt: () => {
      terminalLiveRef.current = false
      setTerminalAttempt((attempt) => attempt + 1)
    }
  })

  const clearRetryTimer = useCallback((): void => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  // Why: a paired fallback can outlive the timer budget while a legal paged
  // inventory rebuilds; a fresh projected alias is the authoritative retry
  // signal, so this compares against the render rather than an effect.
  if (
    catalogSession &&
    catalogSession !== unknownCatalogSession &&
    continuationRef.current === 'outcome-unknown'
  ) {
    setUnknownCatalogSession(catalogSession)
    clearRetryTimer()
    terminalLiveRef.current = false
    setPhase('attaching')
    setTerminalAttempt((attempt) => attempt + 1)
  }

  // Why: a genuine close must wait for the stable alias to be reprojected
  // before probing whether it is now a historical provider session.
  if (
    catalogSession &&
    catalogSession !== closedCatalogSession &&
    continuationRef.current === 'awaiting-historical'
  ) {
    setClosedCatalogSession(catalogSession)
    terminalLiveRef.current = false
    setTerminalAttempt((attempt) => attempt + 1)
  }

  const attachAfterUncertainContinue = useCallback((): void => {
    clearRetryTimer()
    // Why: a mutation with a missing or malformed response may still have
    // launched the agent, so recovery can only attach and must never relaunch.
    continuationRef.current = 'outcome-unknown'
    setUnknownCatalogSession(catalogSessionRef.current)
    terminalLiveRef.current = false
    unknownRetryRef.current = 0
    setPhase('attaching')
    setTerminalAttempt((attempt) => attempt + 1)
    toast.warning(
      translate(
        'auto.components.coworking.CoworkingSessionPane.continueOutcomeUnknown',
        'The agent may have started on the owner’s desktop. Reconnecting to its terminal without starting it again.'
      )
    )
  }, [clearRetryTimer])

  const continueSession = useCallback(async (): Promise<void> => {
    if (
      continuationRef.current !== 'not-started' ||
      !selectCoworkingCanControl(useAppStore.getState(), route)
    ) {
      return
    }
    continuationRef.current = 'pending'
    setPhase('continuing')
    try {
      const value = await window.api.coworkingSharing.invoke({
        desktopRef: route.desktopRef,
        connectionEpoch: route.connectionEpoch,
        method: 'session.continue',
        params: { sessionRef: route.sessionRef }
      })
      if (
        !isSameCoworkingSessionRoute(useAppStore.getState().activeCoworkingWorkspaceRoute, route)
      ) {
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
      if (
        !isSameCoworkingSessionRoute(useAppStore.getState().activeCoworkingWorkspaceRoute, route)
      ) {
        return
      }
      if (getCoworkingRequesterTransportErrorCode(error) === 'outcome_unknown') {
        attachAfterUncertainContinue()
        return
      }
      continuationRef.current = 'not-started'
      setPhase(
        selectCoworkingCanControl(useAppStore.getState(), route)
          ? 'continue-error'
          : 'waiting-control'
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
    if (!isSameCoworkingSessionRoute(useAppStore.getState().activeCoworkingWorkspaceRoute, route)) {
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

  const scheduleUnknownAttachment = useCallback((): void => {
    scheduleCoworkingUnknownAttachment({
      unknownRetryRef,
      retryTimerRef,
      terminalLiveRef,
      clearRetryTimer,
      setPhase,
      setTerminalAttempt
    })
  }, [clearRetryTimer])

  const handleSubscriptionError = useCallback(
    (code: CoworkingRequesterTransportErrorCode | null): void => {
      recoverFromCoworkingSubscriptionError({
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
      })
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

  const handleClosed = useCallback(
    (canContinue: boolean): void => {
      recoverFromCoworkingSessionClose({
        canContinue,
        continuationRef,
        terminalLiveRef,
        catalogSessionRef,
        setClosedCatalogSession,
        clearRetryTimer,
        resetReconnect,
        setPhase
      })
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
      if (currentSession && currentSession !== closedCatalogSession) {
        setClosedCatalogSession(currentSession)
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

  return {
    phase,
    canControl,
    terminalAttempt,
    handleSubscriptionError,
    handleLive,
    handleClosed,
    retry
  }
}
