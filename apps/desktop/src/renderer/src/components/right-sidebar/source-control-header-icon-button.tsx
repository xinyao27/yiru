import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

export function SourceControlHeaderIconButton({
  icon: Icon,
  label,
  onClick,
  disabled
}: {
  icon: PhosphorIcon
  label: string
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
          >
            <Icon className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
