import type React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

export function SpoolTooltipIconButton({
  children,
  label,
  className,
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof Button> & { label: string }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant={variant}
            className={cn(
              'bg-sidebar text-muted-foreground hover:bg-sidebar-accent dark:bg-sidebar dark:hover:bg-sidebar-accent',
              className
            )}
            aria-label={label}
            {...props}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
