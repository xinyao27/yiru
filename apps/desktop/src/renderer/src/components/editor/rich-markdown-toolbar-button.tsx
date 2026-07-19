import React from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

type RichMarkdownToolbarButtonProps = {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}

export function RichMarkdownToolbarButton({
  active,
  label,
  onClick,
  children
}: RichMarkdownToolbarButtonProps): React.JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn('rich-markdown-toolbar-button', active && 'is-active')}
              aria-label={label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onClick}
            >
              {children}
            </button>
          }
        />
        <TooltipContent side="bottom" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
