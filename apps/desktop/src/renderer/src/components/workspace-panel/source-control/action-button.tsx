import type { IconProps } from '@phosphor-icons/react'
import React from 'react'

import { cn } from '../../../lib/class-names'
import { Button } from '../../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from '../right-sidebar-button-styles'

export function ActionButton({
  icon: Icon,
  title,
  onClick,
  disabled,
  surface = 'header'
}: {
  icon: React.ComponentType<{ className?: string; weight?: IconProps['weight'] }>
  title: string
  onClick: (event: React.MouseEvent) => void
  disabled?: boolean
  surface?: 'header' | 'row'
}): React.JSX.Element {
  // Why: use the root tooltip provider for sibling delay handoff, and keep the
  // trigger interactive because Chromium suppresses tooltips on disabled buttons.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={surface === 'row' ? 'row-action' : 'outline'}
            size="icon-xs"
            className={cn(
              surface === 'header' && RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME,
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            aria-label={title}
            aria-disabled={disabled}
            onClick={(event) => {
              if (disabled) {
                event.preventDefault()
                return
              }
              onClick(event)
            }}
          >
            <Icon className="size-3.5" weight="regular" />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {title}
      </TooltipContent>
    </Tooltip>
  )
}
