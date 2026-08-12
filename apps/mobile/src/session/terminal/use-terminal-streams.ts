import { useCallback, useRef } from 'react'

import type {
  TerminalKeyboardAvoidanceMetrics,
  TerminalWebViewHandle
} from '~/terminal/webview/contract'
import type { RpcClient } from '~/transport/rpc-client'
import type { MobileMultiplexedTerminal } from '~/transport/terminal-multiplex/types'

import * as nativeChatTerminalStream from '../native-chat/terminal-stream'
import type { MobileDisplayMode } from '../screen-state'
import { MobileTerminalDiagnostics } from './diagnostics'
import { updateTerminalCwdFromStreamEvent } from './records'
import {
  applyMobileTerminalSnapshotMetadata,
  mobileTerminalSnapshotDiagnostic
} from './snapshot-state'
import { subscribeMobileTerminalSafely } from './stream-subscribe'

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
  terminalStreamsRef: React.RefObject<Map<string, MobileMultiplexedTerminal>>
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
  const terminalRefs = useRef(new Map<string, TerminalWebViewHandle>())
  const terminalStreamsRef = useRef(new Map<string, MobileMultiplexedTerminal>())
  const terminalDiagnosticsRef = useRef(new MobileTerminalDiagnostics())
  const terminalUnsubsRef = useRef(new Map<string, () => void>())
  const subscribingHandlesRef = useRef(new Set<string>())
  const initializedHandlesRef = useRef(new Set<string>())
  const webReadyHandlesRef = useRef(new Set<string>())
  const terminalCwdRef = useRef(new Map<string, string>())
  const viewportRef = useRef<{ cols: number; rows: number } | null>(null)
  const viewportMeasuredRef = useRef(false)
  const terminalFrameHeightRef = useRef(0)
  const subscribeSeqRef = useRef(new Map<string, number>())
  const pendingSnapshotAckRef = useRef(new Map<string, number>())

  const getTerminalRef = useCallback((handle: string | null) => {
    return handle ? terminalRefs.current.get(handle) : undefined
  }, [])

  const unsubscribeTerminal = useCallback(
    (handle: string) => {
      terminalUnsubsRef.current.get(handle)?.()
      terminalUnsubsRef.current.delete(handle)
      terminalStreamsRef.current.delete(handle)
      pendingSnapshotAckRef.current.delete(handle)
      subscribingHandlesRef.current.delete(handle)
      subscribeSeqRef.current.set(handle, (subscribeSeqRef.current.get(handle) ?? 0) + 1)
      terminalDiagnosticsRef.current.terminalUnsubscribed(handle)
      clearNativeChatInputLease(handle)
    },
    [clearNativeChatInputLease]
  )
  const unsubscribeTerminalRef = useRef(unsubscribeTerminal)
  unsubscribeTerminalRef.current = unsubscribeTerminal

  const clearTerminalCache = useCallback(() => {
    terminalUnsubsRef.current.forEach((unsubscribe) => unsubscribe())
    clearNativeChatInputLease()
    terminalUnsubsRef.current.clear()
    terminalStreamsRef.current.clear()
    subscribingHandlesRef.current.clear()
    initializedHandlesRef.current.clear()
    webReadyHandlesRef.current.clear()
    subscribeSeqRef.current.clear()
    pendingSnapshotAckRef.current.clear()
    terminalCwdRef.current.clear()
    terminalDiagnosticsRef.current.clearTerminalCache()
    setTerminalKeyboardMetrics(new Map())
    for (const terminal of terminalRefs.current.values()) {
      terminal.clear()
    }
  }, [clearNativeChatInputLease, setTerminalKeyboardMetrics])

  const measureViewportOnce = useCallback(
    async (handle: string) => {
      if (viewportMeasuredRef.current) {
        return
      }
      const dimensions = await getTerminalRef(handle)?.measureFitDimensions(
        terminalFrameHeightRef.current || undefined
      )
      terminalDiagnosticsRef.current.viewportMeasured(
        handle,
        dimensions,
        terminalFrameHeightRef.current
      )
      if (dimensions) {
        viewportRef.current = dimensions
        viewportMeasuredRef.current = true
      }
    },
    [getTerminalRef]
  )

  const subscribeToTerminal = useCallback(
    (handle: string) => {
      const diagnostics = terminalDiagnosticsRef.current
      const skip = (reason: string): void =>
        diagnostics.streamSkipped(handle, reason, handle === activeHandleRef.current)
      if (!client || !deviceTokenRef.current) {
        skip('no-client-identity')
        return
      }
      if (terminalUnsubsRef.current.has(handle) || subscribingHandlesRef.current.has(handle)) {
        skip('already-subscribed')
        return
      }
      const covered = nativeChatTerminalStream.isTerminalCoveredByNativeChat(
        showNativeChatRef.current,
        activeHandleRef.current,
        handle
      )
      if (!covered && (!getTerminalRef(handle) || !webReadyHandlesRef.current.has(handle))) {
        skip('webview-not-ready')
        return
      }

      const seq = (subscribeSeqRef.current.get(handle) ?? 0) + 1
      subscribeSeqRef.current.set(handle, seq)
      subscribingHandlesRef.current.add(handle)
      diagnostics.streamArmed(handle, seq, viewportRef.current)
      const isCurrent = (): boolean => subscribeSeqRef.current.get(handle) === seq
      const acknowledgeSnapshot = (snapshotId: number): void => {
        const stream = terminalStreamsRef.current.get(handle)
        if (stream) {
          stream.snapshotParsed(snapshotId)
        } else {
          pendingSnapshotAckRef.current.set(handle, snapshotId)
        }
      }
      const unsubscribe = subscribeMobileTerminalSafely(
        client,
        {
          terminal: handle,
          client: { id: deviceTokenRef.current, type: 'mobile' },
          ...(viewportRef.current ? { viewport: viewportRef.current } : {}),
          delivery: covered
            ? { visible: false, interested: false, priority: 'parked' }
            : { visible: true, interested: true, priority: 'active' },
          callbacks: {
            onData: (data, meta) => {
              if (!isCurrent()) {
                return
              }
              const terminal = getTerminalRef(handle)
              if (!terminal || covered) {
                terminalStreamsRef.current.get(handle)?.outputParsed(meta.endSeq)
                return
              }
              terminal.write(data, meta, (endSeq, receiverQueueBytes) =>
                terminalStreamsRef.current.get(handle)?.outputParsed(endSeq, receiverQueueBytes)
              )
            },
            onSnapshot: (snapshot) => {
              if (!isCurrent()) {
                return
              }
              applyMobileTerminalSnapshotMetadata(
                handle,
                snapshot,
                terminalCwdRef.current,
                setTerminalModes
              )
              diagnostics.firstStreamEvent(handle, seq, 'snapshot')
              diagnostics.streamScrollback(
                handle,
                seq,
                null,
                mobileTerminalSnapshotDiagnostic(snapshot)
              )
              const terminal = getTerminalRef(handle)
              if (!terminal || covered) {
                acknowledgeSnapshot(snapshot.id)
                return
              }
              terminal.restore(snapshot, acknowledgeSnapshot)
              initializedHandlesRef.current.add(handle)
              scheduleDelayedAction(() => getTerminalRef(handle)?.resetZoom(), 200)
            },
            onSubscribed: () => {
              if (isCurrent()) {
                markNativeChatInputLeaseReady(handle)
              }
            },
            onEnd: () => unsubscribeTerminalRef.current(handle),
            onError: (error) => {
              diagnostics.streamFailed(handle, 'protocol', error)
              unsubscribeTerminalRef.current(handle)
            },
            onFitOverrideChanged: ({ mode, cols, rows }) => {
              if (!isCurrent()) {
                return
              }
              getTerminalRef(handle)?.resize(cols, rows)
              setTerminalModes((current) =>
                new Map(current).set(handle, mode === 'mobile-fit' ? 'phone' : 'desktop')
              )
            },
            onMetadata: (metadata) => {
              if (!isCurrent()) {
                return
              }
              updateTerminalCwdFromStreamEvent(handle, metadata, terminalCwdRef.current)
              if (
                metadata.type === 'resized' &&
                typeof metadata.cols === 'number' &&
                typeof metadata.rows === 'number'
              ) {
                getTerminalRef(handle)?.resize(metadata.cols, metadata.rows)
              }
            },
            onClearBuffer: () => getTerminalRef(handle)?.clear(),
            onTransportClose: () => unsubscribeTerminalRef.current(handle)
          }
        },
        (stream) => {
          if (!isCurrent()) {
            stream.close()
            return
          }
          terminalStreamsRef.current.set(handle, stream)
          subscribingHandlesRef.current.delete(handle)
          const pendingSnapshotId = pendingSnapshotAckRef.current.get(handle)
          if (pendingSnapshotId !== undefined) {
            pendingSnapshotAckRef.current.delete(handle)
            stream.snapshotParsed(pendingSnapshotId)
          }
        },
        (error) => {
          diagnostics.streamFailed(handle, 'connect', error)
          unsubscribeTerminalRef.current(handle)
        }
      )
      if (isCurrent()) {
        terminalUnsubsRef.current.set(handle, unsubscribe)
      } else {
        unsubscribe()
      }
    },
    [client, getTerminalRef, markNativeChatInputLeaseReady, scheduleDelayedAction, setTerminalModes]
  )

  return {
    terminalRefs,
    terminalStreamsRef,
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
