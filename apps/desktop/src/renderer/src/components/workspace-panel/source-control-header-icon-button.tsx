import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

export function SourceControlHeaderIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  iconWeight,
  variant = 'outline'
}: {
  icon: PhosphorIcon
  label: string
  onClick: () => void
  disabled?: boolean
  iconWeight?: IconProps['weight']
  variant?: 'ghost' | 'outline'
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size="icon-xs"
            className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
          >
            <Icon className="size-3.5" weight={iconWeight} />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
