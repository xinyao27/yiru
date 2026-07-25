import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import type React from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

type SidebarDisclosureProps = {
  expanded: boolean
  className?: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>
  label?: string
  itemLabel?: string
  dataAttribute?: 'repo-header-collapse'
}

const DISCLOSURE_CLASS_NAME =
  'flex size-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none'

export function SidebarDisclosure({
  expanded,
  className,
  onClick,
  onPointerDown,
  label,
  itemLabel,
  dataAttribute
}: SidebarDisclosureProps): React.JSX.Element {
  const icon = (
    <ChevronDown
      aria-hidden="true"
      weight="regular"
      className={cn(
        'size-3.5 transition-transform motion-reduce:transition-none',
        !expanded && '-rotate-90'
      )}
    />
  )

  if (!onClick) {
    return (
      <span className={cn(DISCLOSURE_CLASS_NAME, className)} aria-hidden="true">
        {icon}
      </span>
    )
  }

  return (
    <Button
      variant="ghost"
      size="xs"
      type="button"
      className={cn(
        'p-0 h-auto border-0 focus-visible:bg-accent',
        DISCLOSURE_CLASS_NAME,
        className
      )}
      aria-label={
        label ??
        (itemLabel
          ? expanded
            ? translate(
                'auto.components.sidebar.SpoolWorktreeRow.collapse',
                'Collapse {{value0}}',
                { value0: itemLabel }
              )
            : translate('auto.components.sidebar.SpoolWorktreeRow.expand', 'Expand {{value0}}', {
                value0: itemLabel
              })
          : undefined)
      }
      aria-expanded={expanded}
      data-repo-header-collapse-affordance={
        dataAttribute === 'repo-header-collapse' ? '' : undefined
      }
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {icon}
    </Button>
  )
}
