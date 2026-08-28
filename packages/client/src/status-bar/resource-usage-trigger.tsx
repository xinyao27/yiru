import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  Memory as MemoryStick,
  Terminal
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { PopoverTrigger } from '~renderer/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './context-menu-policy'

type ResourceUsageTriggerProps = {
  iconOnly: boolean
  memoryLabel: string
  sessionCount: number
  orphanCount: number
  isDaemonUnreachable: boolean
  isSpaceScanReady: boolean
  ariaLabel: string
  tooltipLines: string[]
}

export function ResourceUsageTrigger({
  iconOnly,
  memoryLabel,
  sessionCount,
  orphanCount,
  isDaemonUnreachable,
  isSpaceScanReady,
  ariaLabel,
  tooltipLines
}: ResourceUsageTriggerProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <PopoverTrigger
            render={
              <Button
                variant="status-bar"
                size="status-bar"
                type="button"
                {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
                className="relative"
                aria-label={
                  isDaemonUnreachable
                    ? translate(
                        'auto.components.status.bar.ResourceUsageStatusSegment.59f178fe11',
                        '{{value0}}, daemon unreachable',
                        { value0: ariaLabel }
                      )
                    : ariaLabel
                }
              >
                {isSpaceScanReady ? (
                  <span
                    className="bg-primary absolute -top-0.5 -right-0.5 size-1.5"
                    aria-hidden="true"
                  />
                ) : null}
                <MemoryStick className="text-muted-foreground size-3" />
                {!iconOnly ? (
                  <>
                    <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
                      {memoryLabel}
                    </span>
                    <span className="text-muted-foreground/50">·</span>
                    <Terminal className="text-muted-foreground size-3" />
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      {sessionCount}
                      {orphanCount > 0 ? (
                        <span className="ml-0.5 text-yellow-500">({orphanCount})</span>
                      ) : null}
                    </span>
                  </>
                ) : null}
                {isDaemonUnreachable ? (
                  <AlertTriangle
                    className="size-3 text-yellow-500"
                    aria-label={translate(
                      'auto.components.status.bar.ResourceUsageStatusSegment.ca95d077db',
                      'Daemon unreachable'
                    )}
                  />
                ) : null}
              </Button>
            }
          />
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        <div className="space-y-0.5">
          {tooltipLines.map((line, index) => (
            <div
              key={`${index}:${line}`}
              className={line === 'Space scan ready' ? 'text-primary' : ''}
            >
              {line}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
