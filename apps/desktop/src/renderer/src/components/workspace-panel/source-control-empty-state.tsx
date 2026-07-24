import type { IconProps } from '@phosphor-icons/react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

import type { GitStatusEntry } from '../../../../shared/types'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

export function EmptyState({
  heading,
  supportingText
}: {
  heading: string
  supportingText: string
}): React.JSX.Element {
  return (
    <div className="px-4 py-6">
      <div className="text-foreground text-sm font-medium">{heading}</div>
      <div className="text-muted-foreground mt-1 text-xs">{supportingText}</div>
    </div>
  )
}

export function ActionButton({
  icon: Icon,
  iconWeight,
  title,
  onClick,
  disabled,
  surface = 'header'
}: {
  icon: React.ComponentType<{ className?: string; weight?: IconProps['weight'] }>
  iconWeight?: IconProps['weight']
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
            variant={surface === 'row' ? 'ghost' : 'outline'}
            size="icon-xs"
            className={cn(
              surface === 'row'
                ? 'bg-accent dark:bg-accent '
                : RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME,
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
            <Icon className="size-3.5" weight={iconWeight} />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

export function compareGitStatusEntries(a: GitStatusEntry, b: GitStatusEntry): number {
  return (
    getConflictSortRank(a) - getConflictSortRank(b) ||
    a.path.localeCompare(b.path, undefined, { numeric: true })
  )
}

export function getConflictSortRank(entry: GitStatusEntry): number {
  if (entry.conflictStatus === 'unresolved') {
    return 0
  }
  if (entry.conflictStatus === 'resolved_locally') {
    return 1
  }
  return 2
}
