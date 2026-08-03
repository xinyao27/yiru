import { useEffect, useRef } from 'react'
import { AppState, Platform, type AppStateStatus } from 'react-native'

import {
  recoverActiveTerminalAfterForeground,
  shouldRecoverTerminalOnAppStateChange
} from '~/terminal/foreground-recovery'
import type { TerminalWebViewHandle } from '~/terminal/webview/contract'
import type { ConnectionState } from '~/transport/types'

export type MobileTerminalForegroundRecoveryDeps = {
  connState: ConnectionState
  connStateRef: React.RefObject<ConnectionState>
  activeHandleRef: React.RefObject<string | null>
  terminalRefs: React.RefObject<Map<string, TerminalWebViewHandle>>
  initializedHandlesRef: React.RefObject<Set<string>>
  scheduleDelayedAction: (fn: () => void, ms: number) => void
  subscribeToTerminal: (handle: string) => void
  unsubscribeTerminal: (handle: string) => void
}

// Replays the active terminal's stream after the app returns to the foreground.
export function useMobileTerminalForegroundRecovery(
  deps: MobileTerminalForegroundRecoveryDeps
): void {
  const {
    connState,
    connStateRef,
    activeHandleRef,
    terminalRefs,
    initializedHandlesRef,
    scheduleDelayedAction,
    subscribeToTerminal,
    unsubscribeTerminal
  } = deps
  const pendingForegroundRecoveryRef = useRef(false)

  useEffect(() => {
    let previousAppState: AppStateStatus | null = AppState.currentState
    const sub = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const shouldRecover = shouldRecoverTerminalOnAppStateChange(
        previousAppState,
        nextAppState,
        Platform.OS
      )
      previousAppState = nextAppState
      if (!shouldRecover) {
        return
      }
      for (const terminalRef of terminalRefs.current.values()) {
        terminalRef.prepareForForegroundRecovery()
      }
      // Why: iOS can resume a live WKWebView with a blank xterm backing store
      // without firing web-ready/reconnect; invalidate the native readiness
      // latch before replay so init waits for the document's pong.
      const outcome = recoverActiveTerminalAfterForeground({
        activeHandleRef,
        terminalRefs,
        initializedHandlesRef,
        connStateRef,
        unsubscribeTerminal,
        subscribeToTerminal,
        schedule: scheduleDelayedAction
      })
      pendingForegroundRecoveryRef.current = outcome === 'deferred'
    })
    return () => {
      sub.remove()
    }
  }, [scheduleDelayedAction, subscribeToTerminal, unsubscribeTerminal])

  // Why: resume usually lands mid-reconnect (the socket dies after ~60-80s of
  // background), so the recovery above defers. Re-run it once the connection
  // is back; otherwise a blanked WKWebView whose socket was merely probed (no
  // stream replay) stays stale until a manual tab switch.
  useEffect(() => {
    if (connState !== 'connected' || !pendingForegroundRecoveryRef.current) {
      return
    }
    pendingForegroundRecoveryRef.current = false
    if (AppState.currentState !== 'active') {
      return
    }
    recoverActiveTerminalAfterForeground({
      activeHandleRef,
      terminalRefs,
      initializedHandlesRef,
      connStateRef,
      unsubscribeTerminal,
      subscribeToTerminal,
      schedule: scheduleDelayedAction
    })
  }, [connState, scheduleDelayedAction, subscribeToTerminal, unsubscribeTerminal])
}
