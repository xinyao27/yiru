import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
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

type TerminalConnectionStatus = 'connecting' | 'live' | 'closed' | 'error'
type SpoolTerminalOptions = NonNullable<ConstructorParameters<typeof Terminal>[0]>

export function SpoolTerminalPane({
  route,
  onSubscriptionError
}: {
  route: SpoolSessionRoute
  onSubscriptionError?: (code: SpoolRequesterTransportErrorCode) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const suppressResizeRef = useRef(false)
  const mutationTailRef = useRef(Promise.resolve())
  const lastSequenceRef = useRef(-1)
  const lastSentSizeRef = useRef('')
  const settings = useAppStore((state) => state.settings)
  const canControl = useAppStore((state) => selectSpoolCanControl(state, route))
  const systemPrefersDark = useSystemPrefersDark()
  const [status, setStatus] = useState<TerminalConnectionStatus>('connecting')
  const [mutationUncertain, setMutationUncertain] = useState(false)
  const mutationUncertainRef = useRef(false)
  const canMutateTerminal = canControl && !mutationUncertain
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
    const terminal = new Terminal(terminalOptions)
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    const inputDisposable = terminal.onData((data) => {
      enqueueTerminalMutation(
        mutationTailRef,
        mutationUncertainRef,
        markMutationUncertain,
        route,
        'terminal.input',
        {
          sessionRef: route.sessionRef,
          data
        }
      )
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
      enqueueTerminalMutation(
        mutationTailRef,
        mutationUncertainRef,
        markMutationUncertain,
        route,
        'terminal.resize',
        {
          sessionRef: route.sessionRef,
          cols,
          rows
        }
      )
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

  useEffect(() => {
    const api = window.api.spoolSharing
    let disposed = false
    let started = false
    const subscriptionId = crypto.randomUUID()
    lastSequenceRef.current = -1
    setStatus('connecting')
    terminalRef.current?.reset()

    const dispatch = (event: SpoolRequesterSubscriptionEvent): void => {
      if (event.type === 'next') {
        applyTerminalEvent(event.value, terminalRef.current, lastSequenceRef, suppressResizeRef)
        if (isSpoolTerminalSubscriptionEvent(event.value)) {
          setStatus(event.value.kind === 'closed' ? 'closed' : 'live')
        }
      } else if (event.type === 'complete') {
        setStatus('closed')
      } else {
        setStatus('error')
        onSubscriptionError?.(event.code)
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
      .catch(() => {
        if (!disposed) {
          setStatus('error')
        }
      })

    return () => {
      disposed = true
      unsubscribeEvents()
      if (started) {
        void api.stopSubscription({ subscriptionId })
      }
    }
  }, [onSubscriptionError, route.connectionEpoch, route.desktopRef, route.sessionRef])

  return (
    <div className="pane-manager-root relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--editor-surface)]">
      <div ref={containerRef} className="xterm-container" />
      {mutationUncertain ? (
        <div
          role="status"
          className="absolute left-3 right-3 top-2 flex items-center justify-between gap-3 rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-xs"
        >
          <span>
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
        <div className="pointer-events-none absolute right-3 top-2 rounded-md border border-border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow-xs">
          {getTerminalStatusLabel(status)}
        </div>
      ) : null}
    </div>
  )
}

function enqueueTerminalMutation(
  tailRef: React.MutableRefObject<Promise<void>>,
  uncertainRef: React.MutableRefObject<boolean>,
  markUncertain: () => void,
  route: SpoolSessionRoute,
  method: 'terminal.input' | 'terminal.resize',
  params: Record<string, unknown>
): void {
  tailRef.current = tailRef.current
    .then(async () => {
      if (uncertainRef.current) {
        return
      }
      const state = useAppStore.getState()
      const activeRoute = state.activeSpoolWorkspaceRoute
      if (
        !isSameSpoolSessionRoute(activeRoute, route) ||
        !selectSpoolCanControl(state, activeRoute)
      ) {
        return
      }
      ;(await window.api.spoolSharing.invoke({
        desktopRef: route.desktopRef,
        connectionEpoch: route.connectionEpoch,
        method,
        params
      })) as SpoolMutationResult
    })
    .catch((error: unknown) => {
      const activeRoute = useAppStore.getState().activeSpoolWorkspaceRoute
      if (!isSameSpoolSessionRoute(activeRoute, route)) {
        return
      }
      if (getSpoolRequesterTransportErrorCode(error) === 'outcome_unknown') {
        // Why: later queued keystrokes must not execute until the user has
        // inspected the terminal after an ambiguous mutation result.
        markUncertain()
        toast.warning(
          translate(
            'auto.components.spool.SpoolTerminalPane.outcomeUnknown',
            'This terminal action may have succeeded on the owner’s desktop. Inspect the terminal output before sending more input.'
          ),
          { id: 'spool-terminal-outcome-unknown' }
        )
      }
    })
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

function isSpoolTerminalSubscriptionEvent(value: unknown): value is SpoolTerminalSubscriptionEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const event = value as Record<string, unknown>
  if (event.kind === 'closed') {
    return true
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
): SpoolTerminalOptions {
  const defaults = buildDefaultTerminalOptions()
  if (!settings) {
    return { ...defaults, disableStdin: !canControl, cols: 80, rows: 24 }
  }
  const appearance = resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
  const baseTheme = appearance.theme ?? getBuiltinTheme(appearance.themeName)
  const weights = resolveTerminalFontWeights(settings.terminalFontWeight)
  return {
    ...defaults,
    disableStdin: !canControl,
    cols: 80,
    rows: 24,
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

function getTerminalStatusLabel(status: TerminalConnectionStatus): string {
  if (status === 'connecting') {
    return translate('auto.components.spool.SpoolTerminalPane.connecting', 'Connecting terminal…')
  }
  if (status === 'closed') {
    return translate('auto.components.spool.SpoolTerminalPane.closed', 'Terminal closed')
  }
  return translate('auto.components.spool.SpoolTerminalPane.unavailable', 'Terminal unavailable')
}
