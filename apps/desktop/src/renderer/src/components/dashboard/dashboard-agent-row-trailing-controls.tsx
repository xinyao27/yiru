import { PaperPlaneRight as Send, CaretDown as ChevronDown, X } from '@phosphor-icons/react'
import React, { useCallback } from 'react'

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

type DashboardAgentRowTrailingControlsProps = {
  paneKey: string
  relativeTimestamp: string | null
  expanded: boolean
  hideExpand: boolean
  /** Subagent child rows have no store entry of their own to dismiss —
   *  offering the X would be a silent no-op. */
  hideDismiss?: boolean
  sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
  onDismiss: (paneKey: string) => void
  onToggleExpanded: () => void
  onSendTargetClick?: (paneKey: string) => void
}

export function DashboardAgentRowTrailingControls({
  paneKey,
  relativeTimestamp,
  expanded,
  hideExpand,
  hideDismiss = false,
  sendTargetStatus,
  onDismiss,
  onToggleExpanded,
  onSendTargetClick
}: DashboardAgentRowTrailingControlsProps): React.JSX.Element {
  // Why: stop propagation so clicking nested row controls does not also
  // activate the agent row or parent worktree card.
  const stopMouseDown = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
  }, [])
  const stopKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation()
    }
  }, [])
  const handleDismiss = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      onDismiss(paneKey)
    },
    [onDismiss, paneKey]
  )
  const handleToggleExpand = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onToggleExpanded()
    },
    [onToggleExpanded]
  )
  const handleInlineSendTargetClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (sendTargetStatus === 'eligible') {
        onSendTargetClick?.(paneKey)
      }
    },
    [onSendTargetClick, paneKey, sendTargetStatus]
  )

  return (
    <span className="relative ml-auto flex h-3.5 w-12 shrink-0 items-center justify-end">
      {(sendTargetStatus === 'eligible' || sendTargetStatus === 'sending') && (
        // Why: target styling belongs on the action so the surrounding agent row stays ordinary.
        <button
          type="button"
          onClick={handleInlineSendTargetClick}
          onMouseDown={stopMouseDown}
          onKeyDown={stopKeyDown}
          disabled={sendTargetStatus === 'sending'}
          className={cn(
            'absolute top-1/2 right-0 z-10 inline-flex h-5 -translate-y-1/2 items-center gap-1 rounded-md border border-[color:color-mix(in_srgb,var(--ai-action-accent)_72%,transparent)] bg-[color-mix(in_srgb,var(--ai-action-accent)_12%,transparent)] px-1.5 text-[10px] leading-none font-medium text-foreground transition-[background-color,border-color,color,opacity] outline-none hover:border-[color:color-mix(in_srgb,var(--ai-action-accent)_88%,transparent)] hover:bg-[color-mix(in_srgb,var(--ai-action-accent)_18%,transparent)] focus-visible:bg-accent',
            sendTargetStatus === 'sending' && 'cursor-progress opacity-75'
          )}
          aria-label={translate(
            'auto.components.dashboard.DashboardAgentRow.0272969e28',
            'Send to this agent'
          )}
          title={translate(
            'auto.components.dashboard.DashboardAgentRow.0272969e28',
            'Send to this agent'
          )}
        >
          <Send className="size-3" />
          <span>{translate('auto.components.dashboard.DashboardAgentRow.912e136cd9', 'Send')}</span>
        </button>
      )}
      {!sendTargetStatus && hideDismiss && relativeTimestamp !== null && (
        <span
          className="text-muted-foreground/60 pointer-events-none shrink-0 text-[10px] leading-none"
          aria-hidden
        >
          {relativeTimestamp}
        </span>
      )}
      {/* Why: timestamp and dismiss-X share one slot. On no-hover devices the X
          is visible by default, so the timestamp must yield there too. */}
      {!sendTargetStatus && !hideDismiss && relativeTimestamp !== null && (
        <span className="relative grid shrink-0 grid-cols-1 grid-rows-1 items-center justify-items-end">
          <span
            className={cn(
              '[grid-area:1/1] pointer-events-none text-[10px] leading-none text-muted-foreground/60',
              'transition-opacity duration-150',
              'group-hover/agent-row:opacity-0 [@media(hover:none)]:opacity-0'
            )}
            aria-hidden
          >
            {relativeTimestamp}
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            onMouseDown={stopMouseDown}
            onKeyDown={stopKeyDown}
            className={cn(
              'outline-none focus-visible:text-foreground focus-visible:bg-accent',
              '[grid-area:1/1] inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground',
              'can-hover:opacity-0 transition-opacity duration-150',
              'group-hover/agent-row:opacity-100 focus-visible:opacity-100'
            )}
            aria-label={translate(
              'auto.components.dashboard.DashboardAgentRow.b06e13fcf7',
              'Dismiss agent'
            )}
            title={translate('auto.components.dashboard.DashboardAgentRow.5ae84475cc', 'Dismiss')}
          >
            <X className="size-3.5" />
          </button>
        </span>
      )}
      {!sendTargetStatus && !hideDismiss && relativeTimestamp === null && (
        <button
          type="button"
          onClick={handleDismiss}
          onMouseDown={stopMouseDown}
          onKeyDown={stopKeyDown}
          className={cn(
            'outline-none focus-visible:text-foreground focus-visible:bg-accent',
            'inline-flex shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground',
            'can-hover:opacity-0 transition-opacity duration-150',
            'group-hover/agent-row:opacity-100 focus-visible:opacity-100'
          )}
          aria-label={translate(
            'auto.components.dashboard.DashboardAgentRow.b06e13fcf7',
            'Dismiss agent'
          )}
          title={translate('auto.components.dashboard.DashboardAgentRow.5ae84475cc', 'Dismiss')}
        >
          <X className="size-3.5" />
        </button>
      )}
      {!hideExpand && (
        <button
          type="button"
          onClick={handleToggleExpand}
          onMouseDown={stopMouseDown}
          onKeyDown={stopKeyDown}
          className="text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent inline-flex shrink-0 items-center justify-center outline-none"
          aria-label={
            expanded
              ? translate(
                  'auto.components.dashboard.DashboardAgentRow.a41fb5376e',
                  'Collapse details'
                )
              : translate(
                  'auto.components.dashboard.DashboardAgentRow.a743da52ff',
                  'Expand details'
                )
          }
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn('size-3.5 transition-transform duration-150', expanded && 'rotate-180')}
          />
        </button>
      )}
    </span>
  )
}
