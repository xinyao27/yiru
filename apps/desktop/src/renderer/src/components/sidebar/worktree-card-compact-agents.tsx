import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import React, { useCallback, useRef } from 'react'

import { AgentStateDot } from '@/components/agent-state-dot'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/use-dashboard-data'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent } from '@/lib/agent-status'
import { cn } from '@/lib/class-names'

import {
  buildSummaryAgentGroups,
  selectSummaryGroupIconAgents,
  summarizeAgentIdentities,
  summarizeAgents
} from './worktree-card-agent-summary'

export { CompactAgentRow } from './worktree-card-compact-agent-row'

function stopActivationKeyPropagation(e: React.KeyboardEvent): void {
  // Why: the surrounding worktree list handles Enter/Space as row activation.
  // Focused nested buttons need those keys to stay local.
  if (e.key === 'Enter' || e.key === ' ') {
    e.stopPropagation()
  }
}

type CompactAgentSummaryButtonProps = {
  agents: DashboardAgentRowData[]
  subjectLabel: string
  expanded: boolean
  onToggle: () => void
}

type CompactAgentExpansionProps = {
  expanded: boolean
  contentClassName?: string
  children: React.ReactNode
}

export function CompactAgentExpansion({
  expanded,
  contentClassName,
  children
}: CompactAgentExpansionProps): React.JSX.Element {
  const hasRenderedChildrenRef = useRef(expanded)
  if (expanded) {
    // Why: keep already-opened content mounted for the collapse transition
    // without paying an extra Effect-driven render on first expansion.
    hasRenderedChildrenRef.current = true
  }
  const shouldRenderChildren = expanded || hasRenderedChildrenRef.current

  return (
    // Why: grid-track motion keeps virtualized card height CSS-owned and interruptible.
    <div
      className={cn(
        'grid grid-rows-[0fr] transition-[grid-template-rows] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        expanded && 'grid-rows-[1fr]'
      )}
      aria-hidden={!expanded}
      inert={!expanded}
    >
      <div className="min-h-0 overflow-hidden">
        {shouldRenderChildren && (
          <div
            className={cn(
              'flex flex-col gap-0.5 pt-0.5',
              expanded &&
                'animate-[compact-agent-expansion-reveal_180ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none',
              contentClassName
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

export function CompactAgentSummaryButton({
  agents,
  subjectLabel,
  expanded,
  onToggle
}: CompactAgentSummaryButtonProps): React.JSX.Element {
  const summary = summarizeAgents(agents, subjectLabel)
  const groups = buildSummaryAgentGroups(agents)
  const visibleGroups = groups.slice(0, 3)
  const hiddenGroupAgentCount = groups
    .slice(visibleGroups.length)
    .reduce((count, group) => count + group.agents.length, 0)
  const agentIdentitySummary = summarizeAgentIdentities(agents)
  const stopPointerPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation()
  }, [])
  const handleToggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onToggle()
    },
    [onToggle]
  )
  return (
    <Button
      variant="outline"
      size="xs"
      type="button"
      draggable={false}
      className={cn(
        'justify-start whitespace-normal font-normal flex w-full min-w-0',
        'px-1 text-left text-[11px] leading-none text-muted-foreground',
        'focus-visible:outline-none',
        // Why: expanded is a tree header inside the card, so only the
        // standalone collapsed pill gets a resting surface and border.
        !expanded && 'border-sidebar-border/70 bg-sidebar-accent/35'
      )}
      aria-label={
        expanded
          ? translate(
              'auto.components.sidebar.worktree.card.compact.agents.0c1debfe84',
              'Collapse {{value0}}',
              { value0: subjectLabel }
            )
          : translate(
              'auto.components.sidebar.worktree.card.compact.agents.289a1d2ca7',
              'Expand {{value0}}. {{value1}}',
              { value0: summary, value1: agentIdentitySummary }
            )
      }
      aria-expanded={expanded}
      onClick={handleToggle}
      onKeyDown={stopActivationKeyPropagation}
      onMouseDown={stopPointerPropagation}
      onPointerDown={stopPointerPropagation}
      onDragStart={stopPointerPropagation}
    >
      {expanded ? (
        <span className="text-muted-foreground min-w-0 flex-1 truncate px-1 font-medium">
          {subjectLabel}
        </span>
      ) : (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden" aria-hidden>
            {visibleGroups.map((group) => {
              const iconAgents = selectSummaryGroupIconAgents(group.agents, 3)
              const hiddenIconCount = Math.max(0, group.agents.length - iconAgents.length)
              return (
                <span
                  key={group.state}
                  className="bg-sidebar/70 inline-flex min-w-0 shrink-0 items-center gap-0.5 px-1 py-0.5"
                >
                  <AgentStateDot state={group.state} size="sm" />
                  {/* Why: same-state agent identities read as one status cluster;
                      overlapping them saves width without merging different states. */}
                  <span className="inline-flex shrink-0 items-center -space-x-0.5 pl-0.5">
                    {iconAgents.map((agent) => (
                      <span
                        key={agent.paneKey}
                        className="border-sidebar-border/70 bg-sidebar inline-flex size-4 items-center justify-center border"
                      >
                        <AgentIcon agent={agentTypeToIconAgent(agent.agentType)} size={13} />
                      </span>
                    ))}
                  </span>
                  {hiddenIconCount > 0 && (
                    <span className="text-muted-foreground/70 shrink-0 text-[10px] tabular-nums">
                      +{hiddenIconCount}
                    </span>
                  )}
                </span>
              )
            })}
          </span>
          {hiddenGroupAgentCount > 0 && (
            <span className="text-muted-foreground/70 shrink-0 text-[10px] tabular-nums">
              +{hiddenGroupAgentCount}
            </span>
          )}
        </>
      )}
      <ChevronDown
        weight="regular"
        className={cn(
          'size-3 shrink-0 transition-transform duration-150',
          !expanded && '-rotate-90'
        )}
        aria-hidden
      />
    </Button>
  )
}
