import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITerminalOptions } from '@xterm/xterm'
import { toast } from 'sonner'
import type { GlobalSettings } from '../../../../shared/types'
import type {
  SpoolTerminalSubscriptionEvent,
  SpoolMutationResult
} from '../../../../shared/spool/spool-operation-contract'
import type { SpoolRequesterSubscriptionEvent } from '../../../../shared/spool/spool-ipc-contract'
import type { SpoolRequesterTransportErrorCode } from '../../../../shared/spool/spool-ipc-contract'
import { resolveTerminalFontWeights } from '../../../../shared/terminal-fonts'
import { normalizeTerminalLineHeight } from '../../../../shared/terminal-line-height-settings'
import { useAppStore } from '@/store'
import { selectSpoolCanControl } from '@/store/slices/spool-sharing-selectors'
import { translate } from '@/i18n/i18n'
import { buildDefaultTerminalOptions } from '@/lib/pane-manager/pane-terminal-options'
import { getBuiltinTheme, resolveEffectiveTerminalAppearance } from '@/lib/terminal-theme'
import { buildFontFamily } from '@/components/terminal-pane/layout-serialization'
import { composeActiveTerminalTheme } from '@/components/terminal-pane/terminal-appearance'
import { useSystemPrefersDark } from '@/components/terminal-pane/use-system-prefers-dark'
import { Button } from '@/components/ui/button'
import { getSpoolRequesterTransportErrorCode } from './spool-requester-error'
import { isSameSpoolSessionRoute, type SpoolSessionRoute } from './spool-session-route'
import { createSpoolTerminalSubscriptionSettlement } from './spool-terminal-subscription-settlement'
import {
  createSpoolTerminalMutationQueue,
  type SpoolTerminalMutation
} from './spool-terminal-mutation-queue'
import { notifySpoolTerminalInputBacklog } from './spool-terminal-input-backlog'
import {
  getSpoolTerminalStatusLabel,
  type SpoolTerminalConnectionStatus
} from './spool-terminal-status-label'
import { useSpoolTerminalFocusRequest } from './use-spool-terminal-focus-request'

type RenderableSpoolTerminalSubscriptionEvent = Exclude<
  SpoolTerminalSubscriptionEvent,
  { kind: 'unavailable' }
>
const SPOOL_TERMINAL_INPUT_FLUSH_MS = 8

export function SpoolTerminalPane({
  route,
  focusRequested = false,
  onFocusHandled,
  onSubscriptionError,
  onLive,
  onClosed
}: {
  route: SpoolSessionRoute
  focusRequested?: boolean
  onFocusHandled?: () => void
  onSubscriptionError?: (code: SpoolRequesterTransportErrorCode | null) => void
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
  const canControl = useAppStore((state) => selectSpoolCanControl(state, route))
  const systemPrefersDark = useSystemPrefersDark()
  const [status, setStatus] = useState<SpoolTerminalConnectionStatus>('connecting')
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
    const mutationQueue = createSpoolTerminalMutationQueue({
      inputFlushMs: SPOOL_TERMINAL_INPUT_FLUSH_MS,
      invoke: async (mutation) => {
        await invokeTerminalMutation(mutationUncertainRef, route, mutation)
      },
      shouldDiscardAfterError: (error) =>
        handleTerminalMutationError(error, route, markMutationUncertain),
      onCapacityExceeded: notifySpoolTerminalInputBacklog
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
      setStatus('error')
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

  useSpoolTerminalFocusRequest(terminalRef, focusRequested && canMutateTerminal, onFocusHandled)

  useEffect(() => {
    const api = window.api.spoolSharing
    let disposed = false
    let started = false
    const subscriptionId = crypto.randomUUID()
    lastSequenceRef.current = -1
    terminalRef.current?.reset()
    const settlement = createSpoolTerminalSubscriptionSettlement({
      setStatus,
      onClosed,
      onError: onSubscriptionError
    })
    const dispatch = (event: SpoolRequesterSubscriptionEvent): void => {
      if (settlement.isSettled()) {
        return
      }
      if (event.type === 'next') {
        applyTerminalEvent(event.value, terminalRef.current, lastSequenceRef, suppressResizeRef)
        if (isSpoolTerminalSubscriptionEvent(event.value)) {
          if (event.value.kind === 'closed') {
            settlement.complete(event.value.canContinue === true)
          } else {
            setStatus('live')
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
          settlement.error(getSpoolRequesterTransportErrorCode(error))
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
    <div className="pane-manager-root relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--editor-surface)]">
      <div ref={containerRef} className="xterm-container" />
      {mutationUncertain ? (
        <div
          role="status"
          className="absolute left-3 right-3 top-2 flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-xs"
        >
          <span className="text-muted-foreground">
            {translate(
              'auto.components.spool.SpoolTerminalPane.outcomeUnknownPersistent',
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
            {translate('auto.components.spool.SpoolTerminalPane.resumeInput', 'Resume input')}
          </Button>
        </div>
      ) : status !== 'live' ? (
        <div className="pointer-events-none absolute right-3 top-2 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-card-foreground shadow-xs">
          <span className="text-muted-foreground">{getSpoolTerminalStatusLabel(status)}</span>
        </div>
      ) : null}
    </div>
  )
}

async function invokeTerminalMutation(
  uncertainRef: React.MutableRefObject<boolean>,
  route: SpoolSessionRoute,
  mutation: SpoolTerminalMutation
): Promise<void> {
  if (uncertainRef.current) {
    return
  }
  const state = useAppStore.getState()
  const activeRoute = state.activeSpoolWorkspaceRoute
  if (!isSameSpoolSessionRoute(activeRoute, route) || !selectSpoolCanControl(state, activeRoute)) {
    return
  }
  const params =
    mutation.method === 'terminal.input'
      ? { sessionRef: route.sessionRef, data: mutation.data }
      : { sessionRef: route.sessionRef, cols: mutation.cols, rows: mutation.rows }
  ;(await window.api.spoolSharing.invoke({
    desktopRef: route.desktopRef,
    connectionEpoch: route.connectionEpoch,
    method: mutation.method,
    params
  })) as SpoolMutationResult
}

function handleTerminalMutationError(
  error: unknown,
  route: SpoolSessionRoute,
  markUncertain: () => void
): boolean {
  const activeRoute = useAppStore.getState().activeSpoolWorkspaceRoute
  if (
    !isSameSpoolSessionRoute(activeRoute, route) ||
    getSpoolRequesterTransportErrorCode(error) !== 'outcome_unknown'
  ) {
    return false
  }
  // Why: later buffered keystrokes must not execute until the user has
  // inspected the terminal after an ambiguous mutation result.
  markUncertain()
  toast.warning(
    translate(
      'auto.components.spool.SpoolTerminalPane.outcomeUnknown',
      'This terminal action may have succeeded on the owner’s desktop. Inspect the terminal output before sending more input.'
    ),
    { id: 'spool-terminal-outcome-unknown' }
  )
  return true
}

function applyTerminalEvent(
  value: unknown,
  terminal: Terminal | null,
  lastSequenceRef: React.MutableRefObject<number>,
  suppressResizeRef: React.MutableRefObject<boolean>
): void {
  if (!terminal || !isSpoolTerminalSubscriptionEvent(value)) {
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

function isSpoolTerminalSubscriptionEvent(
  value: unknown
): value is RenderableSpoolTerminalSubscriptionEvent {
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

function createTerminalOptions(
  settings: GlobalSettings | null,
  systemPrefersDark: boolean,
  canControl: boolean
): ITerminalOptions {
  const defaults = buildDefaultTerminalOptions()
  if (!settings) {
    return { ...defaults, disableStdin: !canControl }
  }
  const appearance = resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
  const baseTheme = appearance.theme ?? getBuiltinTheme(appearance.themeName)
  const weights = resolveTerminalFontWeights(settings.terminalFontWeight)
  return {
    ...defaults,
    disableStdin: !canControl,
    theme: composeActiveTerminalTheme(baseTheme, settings) ?? undefined,
    fontFamily: buildFontFamily(settings.terminalFontFamily),
    fontSize: settings.terminalFontSize,
    fontWeight: weights.fontWeight,
    fontWeightBold: weights.fontWeightBold,
    lineHeight: normalizeTerminalLineHeight(settings.terminalLineHeight),
    allowTransparency:
      settings.terminalBackgroundOpacity !== undefined && settings.terminalBackgroundOpacity < 1
  }
}
