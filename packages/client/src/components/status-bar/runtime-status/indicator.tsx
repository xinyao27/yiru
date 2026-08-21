import { useState } from 'react'
import { CircleDashed, Link, LinkBreak, WarningCircle } from '~renderer/components/icons/hugeicons'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'

import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from '../context-menu-policy'

export type RuntimeStatusIndicatorKind = 'checking' | 'offline' | 'pairing' | 'ready' | 'warning'

export type RuntimeStatusIndicatorDetail = {
  label: string
  tone?: 'default' | 'muted' | 'ready' | 'warning'
  value: string
}

export type RuntimeStatusIndicatorProps = {
  description: string
  details: readonly RuntimeStatusIndicatorDetail[]
  // Why: the popover is where a user looks for connection actions, but which
  // actions exist is the segment's business, not this shared shell's.
  footer?: React.ReactNode
  kind: RuntimeStatusIndicatorKind
  label: string
  onOpenChange?: (open: boolean) => void
  shortLabel: string
  title: string
}

function getStatusTone(kind: RuntimeStatusIndicatorKind): string {
  switch (kind) {
    case 'checking':
    case 'pairing':
      return 'text-muted-foreground'
    case 'ready':
      return 'text-green-700 dark:text-green-300'
    case 'offline':
      return 'text-destructive'
    case 'warning':
      return 'text-amber-600 dark:text-amber-300'
  }
}

function getDetailTone(tone: RuntimeStatusIndicatorDetail['tone']): string {
  switch (tone) {
    case 'muted':
      return 'text-muted-foreground'
    case 'ready':
      return 'text-green-700 dark:text-green-300'
    case 'warning':
      return 'text-amber-600 dark:text-amber-300'
    case 'default':
    case undefined:
      return 'text-foreground'
  }
}

function RuntimeStatusIcon({ kind }: { kind: RuntimeStatusIndicatorKind }): React.JSX.Element {
  switch (kind) {
    case 'pairing':
      return <CircleDashed className="size-3" aria-hidden />
    case 'checking':
      return <LoadingIndicator className="size-3" aria-hidden />
    case 'ready':
      return <Link className="size-3" aria-hidden />
    case 'offline':
      return <LinkBreak className="size-3" aria-hidden />
    case 'warning':
      return <WarningCircle className="size-3" aria-hidden />
  }
}

export function RuntimeStatusIndicator(props: RuntimeStatusIndicatorProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const tone = getStatusTone(props.kind)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        props.onOpenChange?.(nextOpen)
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="status-bar-icon"
                  size="icon-status-bar-wide"
                  aria-label={props.label}
                  aria-expanded={open}
                  {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
                >
                  <span className={tone}>
                    <RuntimeStatusIcon kind={props.kind} />
                  </span>
                </Button>
              }
            />
          }
        />
        <TooltipContent side="top">{props.label}</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 max-w-[calc(100vw-2rem)]"
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
      >
        <div className="border-border flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
          <span className={tone}>
            <RuntimeStatusIcon kind={props.kind} />
          </span>
          <span>{props.title}</span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-3">
          <p className="text-xs font-medium">{props.shortLabel}</p>
          <p className="text-muted-foreground text-xs leading-5">{props.description}</p>
          {props.details.length === 0 ? null : (
            <dl className="border-border mt-2 flex flex-col gap-1.5 border-t pt-2 text-xs">
              {props.details.map((detail) => (
                <div key={detail.label} className="flex min-w-0 items-center justify-between gap-3">
                  <dt className="text-muted-foreground shrink-0">{detail.label}</dt>
                  <dd className={`${getDetailTone(detail.tone)} min-w-0 truncate font-medium`}>
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {props.footer}
        </div>
      </PopoverContent>
    </Popover>
  )
}
