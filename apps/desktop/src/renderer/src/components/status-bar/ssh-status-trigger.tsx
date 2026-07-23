import {
  Warning as AlertTriangle,
  Devices as MonitorSmartphone,
  HardDrives as Server,
  HardDrive as ServerOff
} from '@phosphor-icons/react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

type SshStatusTriggerProps = {
  anyConnecting: boolean
  compact: boolean
  hasSyncProblem: boolean
  iconOnly: boolean
  overall: 'connected' | 'partial' | 'disconnected' | 'connecting'
  statusDotClass: string
  statusLabel: string
}

export function SshStatusTrigger({
  anyConnecting,
  compact,
  hasSyncProblem,
  iconOnly,
  overall,
  statusDotClass,
  statusLabel
}: SshStatusTriggerProps): React.JSX.Element {
  const statusIcon = hasSyncProblem ? (
    <AlertTriangle className="text-destructive size-3" />
  ) : anyConnecting ? (
    <LoadingIndicator
      className={cn('size-3', iconOnly ? 'text-muted-foreground' : 'text-yellow-500')}
    />
  ) : iconOnly ? (
    <MonitorSmartphone className="text-muted-foreground size-3" />
  ) : overall === 'connected' ? (
    <Server className="size-3 text-emerald-500" />
  ) : overall === 'partial' ? (
    <Server className="text-muted-foreground size-3" />
  ) : (
    <ServerOff className="text-muted-foreground size-3" />
  )

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="hover:bg-accent/70 focus-visible:bg-accent/70 inline-flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 outline-none"
                aria-label={translate(
                  'auto.components.status.bar.SshStatusSegment.fdc57e9970',
                  'Remote host connection status'
                )}
              >
                <span className={cn('inline-flex items-center', iconOnly ? 'gap-1' : 'gap-1.5')}>
                  {iconOnly ? (
                    <span className={cn('inline-block size-2 rounded-full', statusDotClass)} />
                  ) : null}
                  {statusIcon}
                  {!iconOnly && !compact ? (
                    <span
                      className={cn(
                        'text-[11px]',
                        hasSyncProblem ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {statusLabel}
                    </span>
                  ) : null}
                  {!iconOnly ? (
                    <span className={cn('inline-block size-1.5 rounded-full', statusDotClass)} />
                  ) : null}
                </span>
              </button>
            }
          />
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        {statusLabel}
      </TooltipContent>
    </Tooltip>
  )
}
