import {
  WarningCircle as AlertCircle,
  CheckCircle as CheckCircle2,
  ArrowClockwise as RefreshCw
} from '@phosphor-icons/react'
import type React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export function RemoteServerUpdateStatusSegment({
  iconOnly
}: {
  iconOnly: boolean
}): React.JSX.Element | null {
  const entries = [...useAppStore((state) => state.remoteServerUpdates).values()]
  const running = useAppStore((state) => state.remoteServerUpdatesRunning)
  const setDialogOpen = useAppStore((state) => state.setRemoteServerUpdateDialogOpen)
  const failed = entries.filter((entry) => entry.phase === 'failed').length
  const updated = entries.filter((entry) => entry.phase === 'updated').length
  const updateCohort = entries.filter((entry) =>
    ['queued', 'checking-update', 'downloading', 'restarting', 'updated', 'failed'].includes(
      entry.phase
    )
  )

  if (!running && failed === 0 && updated === 0) {
    return null
  }

  const segment = running
    ? {
        icon: <RefreshCw className="text-muted-foreground size-3 animate-spin" />,
        label: translate(
          'auto.components.status.bar.RemoteServerUpdateStatusSegment.updating',
          'Updating {{value0}}/{{value1}}',
          { value0: updated + failed, value1: updateCohort.length }
        ),
        tooltip: translate(
          'auto.components.status.bar.RemoteServerUpdateStatusSegment.updatingTooltip',
          'Remote Yiru Server updates are in progress'
        )
      }
    : failed > 0
      ? {
          icon: <AlertCircle className="text-destructive size-3" />,
          label:
            failed === 1
              ? translate(
                  'auto.components.status.bar.RemoteServerUpdateStatusSegment.failedOne',
                  '1 server update failed'
                )
              : translate(
                  'auto.components.status.bar.RemoteServerUpdateStatusSegment.failed',
                  '{{value0}} server updates failed',
                  { value0: failed }
                ),
          tooltip: translate(
            'auto.components.status.bar.RemoteServerUpdateStatusSegment.failedTooltip',
            'Open Remote Yiru Server updates to review and retry'
          )
        }
      : {
          icon: <CheckCircle2 className="text-muted-foreground size-3" />,
          label:
            updated === 1
              ? translate(
                  'auto.components.status.bar.RemoteServerUpdateStatusSegment.updatedOne',
                  '1 server updated'
                )
              : translate(
                  'auto.components.status.bar.RemoteServerUpdateStatusSegment.updated',
                  '{{value0}} servers updated',
                  { value0: updated }
                ),
          tooltip: translate(
            'auto.components.status.bar.RemoteServerUpdateStatusSegment.updatedTooltip',
            'Remote Yiru Server updates completed'
          )
        }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="status-bar"
            size="status-bar"
            type="button"
            onClick={() => setDialogOpen(true)}
            aria-label={segment.tooltip}
          >
            {segment.icon}
            {!iconOnly ? <span className="text-[11px] tabular-nums">{segment.label}</span> : null}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        {segment.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
