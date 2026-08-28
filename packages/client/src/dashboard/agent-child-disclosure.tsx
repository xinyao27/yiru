import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

type Props = {
  childAgentCount?: number
  childAgentsExpanded: boolean
  onToggleChildAgents?: () => void
  reserveDisclosureGutter: boolean
}

export function DashboardAgentChildDisclosure({
  childAgentCount,
  childAgentsExpanded,
  onToggleChildAgents,
  reserveDisclosureGutter
}: Props) {
  const hasChildDisclosure =
    typeof childAgentCount === 'number' &&
    childAgentCount > 0 &&
    typeof onToggleChildAgents === 'function'
  const handleToggleChildren = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    onToggleChildAgents?.()
  }
  const stopMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
  }
  const stopKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation()
    }
  }

  if (!hasChildDisclosure) {
    return reserveDisclosureGutter ? (
      <span aria-hidden className="-ml-0.5 inline-block size-4 shrink-0" />
    ) : null
  }

  // Why: the chevron owns child disclosure; leaf spacers keep the leading
  // state-dot column aligned across the card.
  return (
    <Button
      variant="outline"
      size="icon-xs"
      type="button"
      onClick={handleToggleChildren}
      onMouseDown={stopMouseDown}
      onKeyDown={stopKeyDown}
      className="border-border/80 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground -ml-0.5 size-4"
      aria-label={translate(
        'auto.components.dashboard.DashboardAgentChildDisclosure.1b57ce9fa4',
        '{{value0}} {{value1}} child {{value2}}',
        {
          value0: childAgentsExpanded ? 'Hide' : 'Show',
          value1: childAgentCount,
          value2: childAgentCount === 1 ? 'agent' : 'agents'
        }
      )}
      aria-expanded={childAgentsExpanded}
    >
      <ChevronRight
        className={cn(
          'size-3 transition-transform duration-150',
          childAgentsExpanded && 'rotate-90'
        )}
      />
    </Button>
  )
}
