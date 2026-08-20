import type React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { cn } from '~renderer/lib/class-names'

type TabLabelProps = {
  className?: string
  label: string
  onDoubleClick?: React.MouseEventHandler<HTMLSpanElement>
  showTooltip?: boolean
  style?: React.CSSProperties
}

export function TabLabel({
  className,
  label,
  onDoubleClick,
  showTooltip = true,
  style
}: TabLabelProps): React.JSX.Element {
  const labelElement = (
    <span
      className={cn('mr-1 min-w-0 flex-1 truncate', className)}
      style={style}
      onDoubleClick={onDoubleClick}
    >
      {label}
    </span>
  )

  if (!showTooltip) {
    return labelElement
  }

  return (
    <Tooltip>
      <TooltipTrigger render={labelElement} />
      <TooltipContent
        side="bottom"
        sideOffset={6}
        className="max-w-80 text-left break-words whitespace-normal"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
