import { ChatCircleDots, TerminalWindow } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { toast } from 'sonner'

import { LoadingIndicator } from '@/components/loading-indicator'
import NativeChatView from '@/components/native-chat/native-chat-view'
import { ArrowClockwise, X } from '@/components/regular-icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'

import type { GlobalAssistantSession } from '../../../../shared/global-assistant-types'
import {
  clampGlobalAssistantPanelBounds,
  persistGlobalAssistantPanelBounds,
  readGlobalAssistantPanelBounds,
  resizeGlobalAssistantPanelBounds,
  type GlobalAssistantPanelBounds,
  type GlobalAssistantResizeDirection
} from './global-assistant-panel-bounds'
import { GlobalAssistantResizeHandles } from './global-assistant-resize-handles'

type GlobalAssistantPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onShowTerminal: () => void
}

type PanelState =
  | { kind: 'loading' }
  | { kind: 'ready'; session: GlobalAssistantSession }
  | { kind: 'error'; message: string }

type PointerInteraction = {
  kind: 'drag' | 'resize'
  direction?: GlobalAssistantResizeDirection
  pointerId: number
  startX: number
  startY: number
  bounds: GlobalAssistantPanelBounds
}

export default function GlobalAssistantPanel({
  open,
  onOpenChange,
  onShowTerminal
}: GlobalAssistantPanelProps): React.JSX.Element | null {
  const [bounds, setBounds] = useState(readGlobalAssistantPanelBounds)
  const [state, setState] = useState<PanelState>({ kind: 'loading' })
  const [showLoadingFeedback, setShowLoadingFeedback] = useState(false)
  const interactionRef = useRef<PointerInteraction | null>(null)
  const loadingFeedbackTimerRef = useRef<number | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const loadSession = useCallback(async (mode: 'reuse' | 'restart') => {
    setState({ kind: 'loading' })
    setShowLoadingFeedback(false)
    if (loadingFeedbackTimerRef.current !== null) {
      window.clearTimeout(loadingFeedbackTimerRef.current)
    }
    loadingFeedbackTimerRef.current = window.setTimeout(() => {
      loadingFeedbackTimerRef.current = null
      setShowLoadingFeedback(true)
    }, 200)
    try {
      const session =
        mode === 'restart'
          ? await window.api.globalAssistant.restart()
          : await window.api.globalAssistant.getOrCreate()
      setState({ kind: 'ready', session })
    } catch (error) {
      setState({
        kind: 'error',
        message: extractIpcErrorMessage(
          error,
          translate('components.global-assistant.startError', 'Global Assistant could not start.')
        )
      })
    } finally {
      if (loadingFeedbackTimerRef.current !== null) {
        window.clearTimeout(loadingFeedbackTimerRef.current)
        loadingFeedbackTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (open) {
      void loadSession('reuse')
    }
  }, [loadSession, open])

  useEffect(() => {
    if (!open || state.kind !== 'ready') {
      return
    }
    // Why: shortcut-opened assistant panels should accept typing immediately
    // instead of leaving focus in the obscured workspace beneath them.
    const frame = window.requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLElement>('[data-native-chat-root="true"]')
        ?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, state])

  useEffect(
    () => () => {
      if (loadingFeedbackTimerRef.current !== null) {
        window.clearTimeout(loadingFeedbackTimerRef.current)
      }
    },
    []
  )

  useEffect(() => {
    const onResize = (): void => {
      setBounds((current) => {
        const next = clampGlobalAssistantPanelBounds(current)
        persistGlobalAssistantPanelBounds(next)
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent): void => {
      const interaction = interactionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }
      const deltaX = event.clientX - interaction.startX
      const deltaY = event.clientY - interaction.startY
      setBounds(
        interaction.kind === 'resize' && interaction.direction
          ? resizeGlobalAssistantPanelBounds(
              interaction.bounds,
              interaction.direction,
              deltaX,
              deltaY
            )
          : clampGlobalAssistantPanelBounds({
              ...interaction.bounds,
              x: interaction.bounds.x + deltaX,
              y: interaction.bounds.y + deltaY
            })
      )
    }
    const onPointerUp = (event: globalThis.PointerEvent): void => {
      if (interactionRef.current?.pointerId !== event.pointerId) {
        return
      }
      interactionRef.current = null
      setBounds((current) => {
        persistGlobalAssistantPanelBounds(current)
        return current
      })
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  const startInteraction = (
    kind: PointerInteraction['kind'],
    event: PointerEvent<HTMLElement>,
    direction?: GlobalAssistantResizeDirection
  ): void => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    interactionRef.current = {
      kind,
      direction,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      bounds
    }
  }

  const showTerminal = useCallback(async () => {
    try {
      await window.api.globalAssistant.showTerminal()
      onShowTerminal()
    } catch (error) {
      toast.error(
        extractIpcErrorMessage(
          error,
          translate(
            'components.global-assistant.terminalError',
            'Could not open the assistant terminal.'
          )
        )
      )
    }
  }, [onShowTerminal])

  if (!open) {
    return null
  }

  return (
    <section
      role="dialog"
      aria-label={translate('components.global-assistant.title', 'Global Assistant')}
      className="bg-background text-foreground fixed z-30 flex flex-col overflow-hidden border shadow-lg"
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
    >
      <GlobalAssistantResizeHandles
        onResizeStart={(direction, event) => startInteraction('resize', event, direction)}
      />
      <header
        className="bg-card text-card-foreground flex h-9 shrink-0 cursor-move items-center gap-2 border-b px-2"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) {
            return
          }
          startInteraction('drag', event)
        }}
      >
        <ChatCircleDots className="text-muted-foreground size-4" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {translate('components.global-assistant.title', 'Global Assistant')}
        </span>
        <HeaderButton
          label={translate('components.global-assistant.newConversation', 'New conversation')}
          onClick={() => void loadSession('restart')}
          disabled={state.kind === 'loading'}
          icon={<ArrowClockwise className="size-3.5" />}
        />
        <HeaderButton
          label={translate('components.global-assistant.showTerminal', 'Show raw terminal')}
          onClick={() => void showTerminal()}
          disabled={state.kind !== 'ready'}
          icon={<TerminalWindow className="size-3.5" />}
        />
        <HeaderButton
          label={translate('components.global-assistant.close', 'Close assistant')}
          onClick={() => onOpenChange(false)}
          icon={<X className="size-3.5" />}
        />
      </header>
      <div ref={contentRef} className="min-h-0 flex-1">
        {state.kind === 'loading' ? (
          showLoadingFeedback ? (
            <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
              <LoadingIndicator className="size-4" />
              {translate('components.global-assistant.starting', 'Starting assistant…')}
            </div>
          ) : null
        ) : state.kind === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {translate('components.global-assistant.unavailable', 'Assistant unavailable')}
              </p>
              <p className="text-muted-foreground max-w-md text-sm">{state.message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadSession('reuse')}>
              {translate('components.global-assistant.retry', 'Retry')}
            </Button>
          </div>
        ) : (
          <NativeChatView
            terminalTabId={state.session.tabId}
            paneKey={state.session.paneKey}
            targetPtyId={state.session.ptyId}
            launchAgent={state.session.agent}
            onSwitchToTerminal={() => void showTerminal()}
          />
        )}
      </div>
    </section>
  )
}

function HeaderButton({
  label,
  icon,
  onClick,
  disabled = false
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            {icon}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
