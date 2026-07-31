import React from 'react'
import { Button } from '~renderer/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '~renderer/components/ui/tooltip'
import { cn } from '~renderer/lib/class-names'

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
            <Button
              variant="quiet"
              size="xs"
              type="button"
              className={cn(
                'inline-flex h-7 min-w-7 shrink-0 items-center justify-center border border-transparent px-2 text-xs font-semibold',
                'hover:border-[color-mix(in_srgb,var(--border)_82%,transparent)]',
                active &&
                  'border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-accent text-foreground'
              )}
              aria-label={label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onClick}
            >
              {children}
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
