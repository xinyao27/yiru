import type React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

export function SpoolTruncatedPathLabel({
  className,
  emptyLabel,
  path
}: {
  className?: string
  emptyLabel?: string
  path: string
}): React.JSX.Element {
  const label = path || emptyLabel || ''
  const content = (
    <span className={cn('min-w-0 truncate font-mono text-xs', className)}>{label}</span>
  )

  if (!path) {
    return content
  }

  return (
    <Tooltip>
      <TooltipTrigger render={content} />
      <TooltipContent
        side="top"
        sideOffset={4}
        className="max-w-80 whitespace-normal break-all text-left font-mono"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
