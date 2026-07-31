import { useCallback, useRef } from 'react'

import type {
  TerminalKeyboardAvoidanceMetrics,
  TerminalWebViewHandle
} from '~/terminal/webview/contract'
import type { RpcClient } from '~/transport/rpc-client'

import * as nativeChatTerminalStream from '../native-chat/terminal-stream'
import type { MobileDisplayMode } from '../screen-state'
import { MobileTerminalDiagnostics } from './diagnostics'
import { subscribeMobileTerminalSafely } from './stream-subscribe'
import { handleMobileTerminalStreamEvent } from './terminal-stream-event'

export type MobileTerminalStreamsDeps = {
  client: RpcClient | null
  activeHandleRef: React.RefObject<string | null>
  deviceTokenRef: React.RefObject<string | null>
  showNativeChatRef: React.MutableRefObject<boolean>
  markNativeChatInputLeaseReady: (handle: string) => void
  clearNativeChatInputLease: (handle?: string) => void
  scheduleDelayedAction: (fn: () => void, ms: number) => void
  setTerminalModes: React.Dispatch<React.SetStateAction<Map<string, MobileDisplayMode>>>
  setTerminalKeyboardMetrics: React.Dispatch<
    React.SetStateAction<Map<string, TerminalKeyboardAvoidanceMetrics>>
  >
}

export type MobileTerminalStreams = {
  terminalRefs: React.RefObject<Map<string, TerminalWebViewHandle>>
  terminalDiagnosticsRef: React.RefObject<MobileTerminalDiagnostics>
  terminalUnsubsRef: React.RefObject<Map<string, () => void>>
  subscribingHandlesRef: React.RefObject<Set<string>>
  initializedHandlesRef: React.RefObject<Set<string>>
  webReadyHandlesRef: React.RefObject<Set<string>>
  terminalCwdRef: React.RefObject<Map<string, string>>
  viewportRef: React.RefObject<{ cols: number; rows: number } | null>
  viewportMeasuredRef: React.RefObject<boolean>
  terminalFrameHeightRef: React.RefObject<number>
  getTerminalRef: (handle: string | null) => TerminalWebViewHandle | undefined
  subscribeToTerminal: (handle: string) => void
  unsubscribeTerminal: (handle: string) => void
  clearTerminalCache: () => void
  measureViewportOnce: (handle: string) => Promise<void>
}

// Owns the mobile terminal stream lifecycle for one session route: the xterm
// WebView handles, the per-handle subscription generation counters, the layout
// staleness high-water marks, and the measured phone viewport.
export function useMobileTerminalStreams(deps: MobileTerminalStreamsDeps): MobileTerminalStreams {
  const {
    client,
    activeHandleRef,
    deviceTokenRef,
    showNativeChatRef,
    markNativeChatInputLeaseReady,
    clearNativeChatInputLease,
    scheduleDelayedAction,
    setTerminalModes,
    setTerminalKeyboardMetrics
  } = deps

  const terminalRefs = useRef<Map<string, TerminalWebViewHandle>>(new Map())
  const terminalDiagnosticsRef = useRef(new MobileTerminalDiagnostics())
  const terminalUnsubsRef = useRef<Map<string, () => void>>(new Map())
  const subscribingHandlesRef = useRef<Set<string>>(new Set())
  const initializedHandlesRef = useRef<Set<string>>(new Set())
  // Why: WebViews load xterm.js from CDN asynchronously. Hidden WebViews
  // (opacity:0) may have delayed JS execution on iOS. We must not subscribe
  // until the WebView has fired web-ready, otherwise init() messages queue
  // and may not render reliably.
  const webReadyHandlesRef = useRef<Set<string>>(new Set())
  const terminalCwdRef = useRef<Map<string, string>>(new Map())
  // Why: measured once from TerminalWebView on mount, then passed with every
  // subscribe call so the server can auto-fit the PTY to phone dimensions.
  const viewportRef = useRef<{ cols: number; rows: number } | null>(null)
  const viewportMeasuredRef = useRef(false)
  // Why: tracks the pixel height of the terminal frame so measureFitDimensions
  // can use the exact container height instead of relying on window.innerHeight,
  // which can overstate the visible area due to layout timing.
  const terminalFrameHeightRef = useRef<number>(0)
  const subscribeSeqRef = useRef<Map<string, number>>(new Map())
  // Why: server-side layout state machine emits a monotonic seq on every
  // applyLayout. Track the highest seq we've observed per handle and drop
  // any scrollback/resized event with a strictly older seq — these are
  // late-arriving events from a superseded layout (e.g. phone-fit dims
  // landing after the user toggled to desktop). Drops below `>20`-window
  // gap reset (treat as a fresh subscription, e.g. server restart).
  const layoutSeqRef = useRef<Map<string, number>>(new Map())

  const getTerminalRef = useCallback((handle: string | null) => {
    return handle ? terminalRefs.current.get(handle) : undefined
  }, [])

  const unsubscribeTerminal = useCallback(
    (handle: string) => {
      terminalUnsubsRef.current.get(handle)?.()
      terminalUnsubsRef.current.delete(handle)
      subscribingHandlesRef.current.delete(handle)
      terminalDiagnosticsRef.current.terminalUnsubscribed(handle)
      subscribeSeqRef.current.set(handle, (subscribeSeqRef.current.get(handle) ?? 0) + 1)
      // Why: a fresh subscription will land on a new server-side state machine
      // run (or the same one with a higher seq); reset the high-water mark so
      // the first scrollback isn't accidentally dropped as stale.
      layoutSeqRef.current.delete(handle)
      clearNativeChatInputLease(handle)
    },
    [clearNativeChatInputLease]
  )
  const unsubscribeTerminalRef = useRef(unsubscribeTerminal)
  unsubscribeTerminalRef.current = unsubscribeTerminal

  const clearTerminalCache = useCallback(() => {
    terminalUnsubsRef.current.forEach((unsub) => unsub())
    clearNativeChatInputLease()
    terminalUnsubsRef.current.clear()
    subscribingHandlesRef.current.clear()
    initializedHandlesRef.current.clear()
    terminalDiagnosticsRef.current.clearTerminalCache()
    webReadyHandlesRef.current.clear()
    subscribeSeqRef.current.clear()
    layoutSeqRef.current.clear()
    terminalCwdRef.current.clear()
    setTerminalKeyboardMetrics(new Map())
    for (const term of terminalRefs.current.values()) {
      term.clear()
    }
  }, [clearNativeChatInputLease, setTerminalKeyboardMetrics])

  // Why: measures the phone viewport once from the first available TerminalWebView.
  // The viewport dims are passed with every subscribe call so the server can
  // auto-fit the PTY without a separate RPC round-trip.
  const measureViewportOnce = useCallback(
    async (handle: string) => {
      if (viewportMeasuredRef.current) {
        return
      }
      const dims = await getTerminalRef(handle)?.measureFitDimensions(
        terminalFrameHeightRef.current || undefined
      )
      terminalDiagnosticsRef.current.viewportMeasured(handle, dims, terminalFrameHeightRef.current)
      if (dims) {
        viewportRef.current = dims
        viewportMeasuredRef.current = true
      }
    },
    [getTerminalRef]
  )

  const subscribeToTerminal = useCallback(
    (handle: string) => {
      const diagnostics = terminalDiagnosticsRef.current
      const logSkippedGate = (reason: string) =>
        diagnostics.streamSkipped(handle, reason, handle === activeHandleRef.current)
      if (!client) {
        logSkippedGate('no-client')
        return
      }
      if (terminalUnsubsRef.current.has(handle)) {
        logSkippedGate('already-subscribed')
        return
      }
      if (subscribingHandlesRef.current.has(handle)) {
        logSkippedGate('subscribe-in-flight')
        return
      }
      const covered = nativeChatTerminalStream.isTerminalCoveredByNativeChat(
        showNativeChatRef.current,
        activeHandleRef.current,
        handle
      )
      // Why: a native-chat-covered terminal subscribes as the input-floor lease
      // without a mounted xterm webview, so only gate on the webview when NOT covered.
      if (!covered) {
        if (!getTerminalRef(handle)) {
          logSkippedGate('no-webview-ref')
          return
        }
        if (!webReadyHandlesRef.current.has(handle)) {
          logSkippedGate('webview-not-ready')
          return
        }
      }

      subscribingHandlesRef.current.add(handle)
      const seq = (subscribeSeqRef.current.get(handle) ?? 0) + 1
      subscribeSeqRef.current.set(handle, seq)
      diagnostics.streamArmed(handle, seq, viewportRef.current)

      // Why: server handles auto-fit on subscribe — no terminal.focus call needed.
      // The viewport is embedded in the subscribe params so the server resizes
      // the PTY before serializing scrollback. This eliminates the focus→safeFit
      // race and the measure→resize→resubscribe pipeline.
      const unsub = subscribeMobileTerminalSafely(
        client,
        {
          terminal: handle,
          // Why: the device token loads asynchronously and subscribe can fire first;
          // omit the client identity rather than sending a null id as a string.
          ...(deviceTokenRef.current
            ? { client: { id: deviceTokenRef.current, type: 'mobile' as const } }
            : {}),
          viewport: viewportRef.current ?? undefined,
          capabilities: nativeChatTerminalStream.mobileNativeChatTerminalCapabilities(covered)
        },
        (result) => {
          if (subscribeSeqRef.current.get(handle) !== seq) {
            return
          }
          // Why: terminal.subscribe frames are always JSON objects, and the event
          // handler re-checks every field it reads; a guard here would only change
          // which malformed frames get diagnostics-logged.
          const data = result as Record<string, unknown>
          diagnostics.firstStreamEvent(handle, seq, data.type)
          if (data.type === 'end' || data.type === 'error') {
            unsubscribeTerminalRef.current(handle)
            return
          }
          if (data.type === 'subscribed') {
            markNativeChatInputLeaseReady(handle)
            return
          }
          // Why: retain the subscription as the mobile input-floor lease, but
          // do not mutate covered xterm state; return-to-terminal resubscribes.
          if (
            nativeChatTerminalStream.isTerminalCoveredByNativeChat(
              showNativeChatRef.current,
              activeHandleRef.current,
              handle
            )
          ) {
            return
          }
          handleMobileTerminalStreamEvent(data, {
            handle,
            seq,
            diagnostics,
            subscribeSeqRef,
            layoutSeqRef,
            initializedHandlesRef,
            terminalCwdRef,
            viewportRef,
            viewportMeasuredRef,
            terminalFrameHeightRef,
            getTerminalRef,
            setTerminalModes,
            scheduleDelayedAction,
            unsubscribeTerminal,
            subscribeToTerminal
          })
        },
        () => unsubscribeTerminalRef.current(handle)
      )

      if (subscribeSeqRef.current.get(handle) === seq) {
        terminalUnsubsRef.current.set(handle, unsub)
      } else {
        unsub()
      }
      subscribingHandlesRef.current.delete(handle)
    },
    // Why: the deps cannot list subscribeToTerminal itself — the measure→resubscribe
    // path calls back into this very callback — so exhaustiveness stops one short.
    // Everything else it reads is either a ref or an identity-stable callback.
    [
      client,
      getTerminalRef,
      markNativeChatInputLeaseReady,
      scheduleDelayedAction,
      setTerminalModes,
      unsubscribeTerminal
    ]
  )

  return {
    terminalRefs,
    terminalDiagnosticsRef,
    terminalUnsubsRef,
    subscribingHandlesRef,
    initializedHandlesRef,
    webReadyHandlesRef,
    terminalCwdRef,
    viewportRef,
    viewportMeasuredRef,
    terminalFrameHeightRef,
    getTerminalRef,
    subscribeToTerminal,
    unsubscribeTerminal,
    clearTerminalCache,
    measureViewportOnce
  }
}
