import React, { useCallback } from 'react'
import { AgentStateDot, agentStateLabel } from '~renderer/components/agent-state-dot'
import { useAgentRowConversationName } from '~renderer/components/dashboard/use-agent-row-conversation-name'
import type { DashboardAgentRow as DashboardAgentRowData } from '~renderer/components/dashboard/use-dashboard-data'
import { AgentIcon } from '~renderer/lib/agent-catalog'
import { getAgentRowPrimaryText } from '~renderer/lib/agent-row-primary-text'
import { agentTypeToIconAgent, formatAgentTypeLabel } from '~renderer/lib/agent-status'
import { cn } from '~renderer/lib/class-names'

import CacheTimer, { usePromptCacheCountdownForPane } from '../cache-timer'
import { getAgentDotState } from './agent-summary'

function formatShortTimeAgo(ts: number, now: number): string {
  const delta = now - ts
  if (delta < 60_000) {
    return 'now'
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
}

function lastEnteredDoneAt(agent: DashboardAgentRowData): number | null {
  // Why: idle subagent child rows are alive-but-idle (teammates persist
  // between turns), not finished — fall through to the started-at timestamp.
  if (agent.rowSource === 'subagent' && agent.state === 'idle') {
    return null
  }
  const entry = agent.entry
  if (entry.state === 'done') {
    return entry.stateStartedAt
  }
  for (let i = (entry.stateHistory?.length ?? 0) - 1; i >= 0; i--) {
    if (entry.stateHistory[i].state === 'done') {
      return entry.stateHistory[i].startedAt
    }
  }
  return null
}

function getCompactAgentPrimary(
  agent: DashboardAgentRowData,
  conversationName: string | null
): string {
  const prompt = conversationName ?? getAgentRowPrimaryText(agent.entry)
  return prompt || agentStateLabel(getAgentDotState(agent))
}

function getCompactAgentSecondary(agent: DashboardAgentRowData): string {
  if (agent.entry.interrupted === true) {
    return 'Interrupted by user'
  }
  if (agent.state === 'working') {
    const toolName = agent.entry.toolName?.trim() ?? ''
    const toolInput = agent.entry.toolInput?.trim() ?? ''
    if (toolName && toolInput) {
      return `${toolName}: ${toolInput}`
    }
    if (toolName) {
      return toolName
    }
  }
  const lastAssistantMessage = agent.entry.lastAssistantMessage?.trim()
  if (lastAssistantMessage) {
    return lastAssistantMessage
  }
  // Why: child rows without descriptions use their role as primary text; repeating it adds no information.
  if (agent.rowSource === 'subagent' && agent.entry.prompt?.trim() === agent.agentType.trim()) {
    return ''
  }
  return formatAgentTypeLabel(agent.agentType)
}

function getCompactAgentTime(agent: DashboardAgentRowData, now: number): string | null {
  const doneAt = lastEnteredDoneAt(agent)
  if (doneAt !== null) {
    return formatShortTimeAgo(doneAt, now)
  }
  const startedAt = agent.startedAt > 0 ? agent.startedAt : agent.entry.stateStartedAt
  return startedAt > 0 ? formatShortTimeAgo(startedAt, now) : null
}

type CompactAgentRowProps = {
  agent: DashboardAgentRowData
  now: number
  onActivate: (tabId: string, paneKey: string) => void
  // Why: send-popover target mode temporarily turns compact sidebar rows into
  // the picker surface, matching the full DashboardAgentRow behavior.
  sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
  sendTargetDisabledReason?: string
  onSendTargetClick?: (paneKey: string) => void
  isFocusedPane?: boolean
}

export const CompactAgentRow = React.memo(function CompactAgentRow({
  agent,
  now,
  onActivate,
  sendTargetStatus,
  sendTargetDisabledReason,
  onSendTargetClick,
  isFocusedPane = false
}: CompactAgentRowProps) {
  // Why: subagent child rows carry the child's NAME (e.g. "pr-reviewer") in
  // agentType, which is not an iconable agent and would render the unknown
  // "?" glyph. Nesting under the parent already conveys identity.
  const hideIcon = agent.rowSource === 'subagent'
  const dotState = getAgentDotState(agent)
  const conversationName = useAgentRowConversationName(agent)
  const primary = getCompactAgentPrimary(agent, conversationName)
  const secondary = getCompactAgentSecondary(agent)
  const model = agent.entry.model?.trim() ?? ''
  const shortTime = getCompactAgentTime(agent, now)
  const cacheTimer = usePromptCacheCountdownForPane(agent.paneKey)

  const handleActivate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Why: subagent child rows have no pane of their own; they focus the
      // parent pane whose session spawned them.
      onActivate(agent.tab.id, agent.activationPaneKey ?? agent.paneKey)
    },
    [agent.activationPaneKey, agent.paneKey, agent.tab.id, onActivate]
  )
  const handleSendTargetClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!sendTargetStatus) {
        return
      }
      const target = e.target
      if (
        target instanceof Element &&
        target.closest('button, a, input, textarea, select, [role="button"]')
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (sendTargetStatus === 'eligible') {
        onSendTargetClick?.(agent.paneKey)
      }
    },
    [agent.paneKey, onSendTargetClick, sendTargetStatus]
  )
  const rowBody = (
    <>
      {!hideIcon && (
        <span className="inline-flex shrink-0" title={formatAgentTypeLabel(agent.agentType)}>
          <AgentIcon agent={agentTypeToIconAgent(agent.agentType)} size={13} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {/* Why: the selected-row fill is strong enough to wash out the dimmed
            prompt/secondary text, so lift both toward full foreground when focused. */}
        <span
          className={
            isFocusedPane
              ? 'text-foreground'
              : 'text-muted-foreground/90 group-hover/agent-row:text-foreground'
          }
        >
          {primary}
        </span>
        {secondary && (
          <span
            className={
              isFocusedPane
                ? 'text-foreground/70'
                : 'text-muted-foreground/65 group-hover/agent-row:text-foreground/75'
            }
          >
            {' '}
            - {secondary}
          </span>
        )}
      </span>
      {model && (
        <span
          className={cn(
            'max-w-24 shrink-0 truncate font-mono text-[10px]',
            isFocusedPane
              ? 'text-foreground/70'
              : 'text-muted-foreground/70 group-hover/agent-row:text-foreground/75'
          )}
          title={model}
        >
          {model}
        </span>
      )}
      {cacheTimer && <CacheTimer startedAt={cacheTimer.startedAt} ttlMs={cacheTimer.ttlMs} />}
      {shortTime && (
        <span
          className={cn(
            'shrink-0 text-[10px] tabular-nums',
            // Why: the muted timestamp drops out against the selected-row fill.
            isFocusedPane
              ? 'text-foreground/70'
              : 'text-muted-foreground/60 group-hover/agent-row:text-foreground/75'
          )}
        >
          {shortTime}
        </span>
      )}
      <AgentStateDot state={dotState} size="sm" />
    </>
  )

  return (
    <div
      draggable={false}
      className={cn(
        'group/agent-row min-w-0 cursor-pointer px-1 text-[11px] leading-none',
        'text-muted-foreground',
        // Why: agent rows sit inside an already-filled workspace card, so hover
        // lifts the row's text instead of stacking a second surface on top.
        isFocusedPane && 'bg-accent text-accent-foreground',
        'flex h-6 items-center gap-1',
        sendTargetStatus === 'sending' && 'cursor-progress opacity-75',
        sendTargetStatus === 'disabled' && 'cursor-default opacity-60'
      )}
      onClickCapture={handleSendTargetClickCapture}
      onClick={handleActivate}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.stopPropagation()}
      data-focused-agent-pane={isFocusedPane ? 'true' : undefined}
      data-agent-send-target={sendTargetStatus}
      role={agent.lineage ? 'treeitem' : undefined}
      aria-level={agent.lineage ? agent.lineage.depth + 1 : undefined}
      title={sendTargetDisabledReason ?? `${primary}${secondary ? ` - ${secondary}` : ''}`}
    >
      {rowBody}
    </div>
  )
})
