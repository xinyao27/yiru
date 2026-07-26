import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

// Why: this file owns its own xterm.js instance (mirroring the pane-manager
// one instead of reusing it) and renders `.xterm-container`, so it needs
// xterm's vendor stylesheet plus the vendor-patch overrides directly — the
// Coworking workspace is its own lazy() chunk that never imports terminal-pane.tsx.
import '@xterm/xterm/css/xterm.css'
import '@/components/terminal-pane/terminal.css'
import { selectCoworkingCanControl } from '@/components/coworking/selectors'
import { useSystemPrefersDark } from '@/components/terminal-pane/use-system-prefers-dark'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import type { CoworkingRequesterSubscriptionEvent } from '../../../../shared/coworking/ipc-contract'
import type { CoworkingRequesterTransportErrorCode } from '../../../../shared/coworking/ipc-contract'
import type {
  CoworkingTerminalSubscriptionEvent,
  CoworkingMutationResult
} from '../../../../shared/coworking/operation-contract'
import { getCoworkingRequesterTransportErrorCode } from './requester-error'
import { isSameCoworkingSessionRoute, type CoworkingSessionRoute } from './session-route'
import { useCoworkingTerminalAttachment } from './terminal-attachment'
import { notifyCoworkingTerminalInputBacklog } from './terminal-input-backlog'
import {
  createCoworkingTerminalMutationQueue,
  type CoworkingTerminalMutation
} from './terminal-mutation-queue'
import { createTerminalOptions } from './terminal-options'
import {
  getCoworkingTerminalStatusLabel,
  type CoworkingTerminalConnectionStatus
} from './terminal-status-label'
import { createCoworkingTerminalSubscriptionSettlement } from './terminal-subscription-settlement'
import { useCoworkingTerminalFocusRequest } from './use-terminal-focus-request'

type RenderableCoworkingTerminalSubscriptionEvent = Exclude<
  CoworkingTerminalSubscriptionEvent,
  { kind: 'unavailable' }
>
const COWORKING_TERMINAL_INPUT_FLUSH_MS = 8

export function CoworkingTerminalPane({
  route,
  focusRequested = false,
  onFocusHandled,
  onSubscriptionError,
  onLive,
  onClosed
}: {
  route: CoworkingSessionRoute
  focusRequested?: boolean
  onFocusHandled?: () => void
  onSubscriptionError?: (code: CoworkingRequesterTransportErrorCode | null) => void
  onLive?: () => void
  onClosed?: (canContinue: boolean) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const suppressResizeRef = useRef(false)
  const lastSequenceRef = useRef(-1)
  const lastSentSizeRef = useRef('')
  const settings = useAppStore((state) => state.settings)
  const canControl = useAppStore((state) => selectCoworkingCanControl(state, route))
  const systemPrefersDark = useSystemPrefersDark()
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<CoworkingTerminalConnectionStatus>('connecting')
  const { attachFailed, markAttachFailed } = useCoworkingTerminalAttachment()
  // Why: a failed xterm attach is permanent for this mount, so it outranks the
  // subscription's own status — which otherwise reports 'live' over it once the
  // first terminal event lands, leaving a blank pane that still accepts input.
  const status: CoworkingTerminalConnectionStatus = attachFailed ? 'error' : subscriptionStatus
  const [mutationUncertain, setMutationUncertain] = useState(false)
  const mutationUncertainRef = useRef(false)
  const canMutateTerminal = canControl && status === 'live' && !mutationUncertain
  const canMutateTerminalRef = useRef(canMutateTerminal)
  canMutateTerminalRef.current = canMutateTerminal
  const terminalOptions = useMemo(
    () => createTerminalOptions(settings, systemPrefersDark, canMutateTerminal),
    [canMutateTerminal, settings, systemPrefersDark]
  )

  const markMutationUncertain = (): void => {
    mutationUncertainRef.current = true
    setMutationUncertain(true)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const terminal = new Terminal({
      ...terminalOptions,
      // Why: xterm dimensions are constructor-only; subscription events use
      // terminal.resize() when the owner reports a new terminal size.
      cols: 80,
      rows: 24
    })
    const fitAddon = new FitAddon()
    const mutationQueue = createCoworkingTerminalMutationQueue({
      inputFlushMs: COWORKING_TERMINAL_INPUT_FLUSH_MS,
      invoke: async (mutation) => {
        await invokeTerminalMutation(mutationUncertainRef, route, mutation)
      },
      shouldDiscardAfterError: (error) =>
        handleTerminalMutationError(error, route, markMutationUncertain),
      onCapacityExceeded: notifyCoworkingTerminalInputBacklog
    })
    terminal.loadAddon(fitAddon)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    const inputDisposable = terminal.onData((data) => {
      // Why: a dropped stream must not accept bytes whose outcome cannot be observed.
      if (canMutateTerminalRef.current) {
        mutationQueue.input(data)
      }
    })
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (suppressResizeRef.current || !canMutateTerminalRef.current) {
        return
      }
      const sizeKey = `${cols}:${rows}`
      if (lastSentSizeRef.current === sizeKey) {
        return
      }
      lastSentSizeRef.current = sizeKey
      mutationQueue.resize(cols, rows)
    })
    const resizeObserver = new ResizeObserver(() => {
      if (canMutateTerminalRef.current) {
        fitAddon.fit()
      }
    })
    try {
      terminal.open(container)
      resizeObserver.observe(container)
      if (canMutateTerminalRef.current) {
        fitAddon.fit()
      }
    } catch {
      markAttachFailed()
    }
    return () => {
      resizeObserver.disconnect()
      mutationQueue.dispose()
      inputDisposable.dispose()
      resizeDisposable.dispose()
      fitAddon.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
    // Why: changing session remounts this component by route key; option and
    // authority changes flow through the dedicated effects below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    terminal.options = terminalOptions
    if (canMutateTerminal) {
      window.requestAnimationFrame(() => fitAddonRef.current?.fit())
    }
  }, [canMutateTerminal, terminalOptions])

  useCoworkingTerminalFocusRequest(terminalRef, focusRequested && canMutateTerminal, onFocusHandled)

  useEffect(() => {
    const api = window.api.coworkingSharing
    let disposed = false
    let started = false
    const subscriptionId = crypto.randomUUID()
    lastSequenceRef.current = -1
    terminalRef.current?.reset()
    const settlement = createCoworkingTerminalSubscriptionSettlement({
      setStatus: setSubscriptionStatus,
      onClosed,
      onError: onSubscriptionError
    })
    const dispatch = (event: CoworkingRequesterSubscriptionEvent): void => {
      if (settlement.isSettled()) {
        return
      }
      if (event.type === 'next') {
        applyTerminalEvent(event.value, terminalRef.current, lastSequenceRef, suppressResizeRef)
        if (isCoworkingTerminalSubscriptionEvent(event.value)) {
          if (event.value.kind === 'closed') {
            settlement.complete(event.value.canContinue === true)
          } else {
            setSubscriptionStatus('live')
            onLive?.()
          }
        }
      } else if (event.type === 'complete') {
        settlement.complete(false)
      } else {
        settlement.error(event.code)
      }
    }
    const unsubscribeEvents = api.onSubscriptionEvent((event) => {
      if (disposed) {
        return
      }
      if (event.subscriptionId === subscriptionId) {
        dispatch(event)
      }
    })
    void api
      .startSubscription({
        subscriptionId,
        desktopRef: route.desktopRef,
        connectionEpoch: route.connectionEpoch,
        method: 'terminal.subscribe',
        params: { sessionRef: route.sessionRef, scrollbackRows: 10_000 }
      })
      .then(() => {
        started = true
        if (disposed) {
          void api.stopSubscription({ subscriptionId })
        }
      })
      .catch((error) => {
        if (!disposed) {
          settlement.error(getCoworkingRequesterTransportErrorCode(error))
        }
      })

    return () => {
      disposed = true
      unsubscribeEvents()
      if (started) {
        void api.stopSubscription({ subscriptionId })
      }
    }
  }, [
    onClosed,
    onLive,
    onSubscriptionError,
    route.connectionEpoch,
    route.desktopRef,
    route.sessionRef
  ])

  return (
    <div className="pane-manager-root bg-background relative !h-full min-h-0 !w-full min-w-0 flex-1 overflow-hidden">
      <div ref={containerRef} className="xterm-container" />
      {mutationUncertain ? (
        <div
          role="status"
          className="border-border bg-card text-card-foreground absolute top-2 right-3 left-3 flex items-center justify-between gap-3 border px-3 py-2 text-xs"
        >
          <span className="text-muted-foreground">
            {translate(
              'auto.components.coworking.CoworkingTerminalPane.outcomeUnknownPersistent',
              'A terminal action may have succeeded. Inspect the output before resuming input.'
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0"
            onClick={() => {
              mutationUncertainRef.current = false
              setMutationUncertain(false)
            }}
          >
            {translate(
              'auto.components.coworking.CoworkingTerminalPane.resumeInput',
              'Resume input'
            )}
          </Button>
        </div>
      ) : status !== 'live' ? (
        <div className="border-border bg-card text-card-foreground pointer-events-none absolute top-2 right-3 border px-2 py-1 text-[11px]">
          <span className="text-muted-foreground">{getCoworkingTerminalStatusLabel(status)}</span>
        </div>
      ) : null}
    </div>
  )
}

async function invokeTerminalMutation(
  uncertainRef: React.MutableRefObject<boolean>,
  route: CoworkingSessionRoute,
  mutation: CoworkingTerminalMutation
): Promise<void> {
  if (uncertainRef.current) {
    return
  }
  const state = useAppStore.getState()
  const activeRoute = state.activeCoworkingWorkspaceRoute
  if (
    !isSameCoworkingSessionRoute(activeRoute, route) ||
    !selectCoworkingCanControl(state, activeRoute)
  ) {
    return
  }
  const params =
    mutation.method === 'terminal.input'
      ? { sessionRef: route.sessionRef, data: mutation.data }
      : { sessionRef: route.sessionRef, cols: mutation.cols, rows: mutation.rows }
  ;(await window.api.coworkingSharing.invoke({
    desktopRef: route.desktopRef,
    connectionEpoch: route.connectionEpoch,
    method: mutation.method,
    params
  })) as CoworkingMutationResult
}

function handleTerminalMutationError(
  error: unknown,
  route: CoworkingSessionRoute,
  markUncertain: () => void
): boolean {
  const activeRoute = useAppStore.getState().activeCoworkingWorkspaceRoute
  if (
    !isSameCoworkingSessionRoute(activeRoute, route) ||
    getCoworkingRequesterTransportErrorCode(error) !== 'outcome_unknown'
  ) {
    return false
  }
  // Why: later buffered keystrokes must not execute until the user has
  // inspected the terminal after an ambiguous mutation result.
  markUncertain()
  toast.warning(
    translate(
      'auto.components.coworking.CoworkingTerminalPane.outcomeUnknown',
      'This terminal action may have succeeded on the owner’s desktop. Inspect the terminal output before sending more input.'
    ),
    { id: 'coworking-terminal-outcome-unknown' }
  )
  return true
}

function applyTerminalEvent(
  value: unknown,
  terminal: Terminal | null,
  lastSequenceRef: React.MutableRefObject<number>,
  suppressResizeRef: React.MutableRefObject<boolean>
): void {
  if (!terminal || !isCoworkingTerminalSubscriptionEvent(value)) {
    return
  }
  if (value.kind !== 'closed') {
    if (value.sequence <= lastSequenceRef.current) {
      return
    }
    lastSequenceRef.current = value.sequence
  }
  if (value.kind === 'snapshot') {
    suppressResizeRef.current = true
    terminal.reset()
    terminal.resize(value.cols, value.rows)
    suppressResizeRef.current = false
    terminal.write(value.data)
  } else if (value.kind === 'output') {
    terminal.write(value.data)
  } else if (value.kind === 'resized') {
    suppressResizeRef.current = true
    terminal.resize(value.cols, value.rows)
    suppressResizeRef.current = false
  }
}

function isCoworkingTerminalSubscriptionEvent(
  value: unknown
): value is RenderableCoworkingTerminalSubscriptionEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const event = value as Record<string, unknown>
  if (event.kind === 'closed') {
    return event.canContinue === undefined || typeof event.canContinue === 'boolean'
  }
  if (!Number.isSafeInteger(event.sequence) || Number(event.sequence) < 0) {
    return false
  }
  if (event.kind === 'output') {
    return typeof event.data === 'string'
  }
  if (event.kind === 'snapshot') {
    return typeof event.data === 'string' && isTerminalSize(event.cols, event.rows)
  }
  return event.kind === 'resized' && isTerminalSize(event.cols, event.rows)
}

function isTerminalSize(cols: unknown, rows: unknown): boolean {
  return (
    Number.isSafeInteger(cols) &&
    Number(cols) >= 1 &&
    Number(cols) <= 1_000 &&
    Number.isSafeInteger(rows) &&
    Number(rows) >= 1 &&
    Number(rows) <= 500
  )
}
