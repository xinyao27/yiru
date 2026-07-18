import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TerminalTab } from '../../../../shared/types'
import { TooltipProvider } from '../ui/tooltip'
import DashboardAgentRow from './dashboard-agent-row'
import type { DashboardAgentRow as DashboardAgentRowData } from './use-dashboard-data'

const NOW = 120_000

function makeAgent(
  overrides: Partial<DashboardAgentRowData> = {},
  entryOverrides: Partial<AgentStatusEntry> = {}
): DashboardAgentRowData {
  const paneKey = overrides.paneKey ?? 'tab-1:leaf-1'
  const tab: TerminalTab = {
    id: 'tab-1',
    ptyId: null,
    worktreeId: 'wt-1',
    title: 'Terminal 1',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
  const entry: AgentStatusEntry = {
    state: 'working',
    prompt: 'Fix hover scope',
    updatedAt: 60_000,
    stateStartedAt: 60_000,
    agentType: 'codex',
    paneKey,
    stateHistory: [],
    ...entryOverrides
  }

  return {
    paneKey,
    entry,
    tab,
    agentType: entry.agentType ?? 'codex',
    state: entry.state,
    startedAt: entry.stateStartedAt,
    ...overrides
  }
}

function renderRow(agent: DashboardAgentRowData): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <DashboardAgentRow
        agent={agent}
        onDismiss={vi.fn()}
        onActivate={vi.fn()}
        now={NOW}
        hideIdentityIcon
        hideExpand
      />
    </TooltipProvider>
  )
}

function renderSendTargetRow(
  props: Pick<
    ComponentProps<typeof DashboardAgentRow>,
    'sendTargetStatus' | 'sendTargetDisabledReason'
  >
): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <DashboardAgentRow
        agent={makeAgent()}
        onDismiss={vi.fn()}
        onActivate={vi.fn()}
        now={NOW}
        hideIdentityIcon
        hideExpand
        {...props}
      />
    </TooltipProvider>
  )
}

describe('DashboardAgentRow', () => {
  it('renders orchestration task preview instead of the raw dispatch preamble prompt', () => {
    const markup = renderRow(
      makeAgent(
        {},
        {
          prompt: 'You are working inside Yiru, a multi-agent IDE.',
          orchestration: {
            taskId: 'task-1',
            dispatchId: 'ctx-1',
            taskTitle: 'Checkout race',
            displayName: 'Fix checkout race'
          }
        }
      )
    )

    expect(markup).toContain('Fix checkout race')
    expect(markup).not.toContain('You are working inside Yiru')
  })

  it('shows a send action for eligible target rows', () => {
    const markup = renderSendTargetRow({ sendTargetStatus: 'eligible' })

    expect(markup).toContain('aria-label="Send to this agent"')
    expect(markup).not.toContain('aria-label="Dismiss agent"')
  })

  it('explains why disabled target rows cannot be selected', () => {
    const markup = renderSendTargetRow({
      sendTargetStatus: 'disabled',
      sendTargetDisabledReason: 'Terminal is no longer available'
    })
    expect(markup).toContain('title="Terminal is no longer available • started 1m ago"')
    expect(markup).not.toContain('aria-label="Send to this agent"')
  })

  it('disables target rows while a send is in progress', () => {
    const markup = renderSendTargetRow({
      sendTargetStatus: 'sending',
      sendTargetDisabledReason: 'Sending...'
    })
    expect(markup).toContain('title="Sending... • started 1m ago"')
    expect(markup).toContain('aria-label="Send to this agent"')
    expect(markup).toContain('disabled=""')
  })

  it('labels waiting rows as needing input', () => {
    const markup = renderRow(makeAgent({}, { state: 'waiting' }))

    expect(markup).toContain('aria-label="Waiting for input"')
  })

  it('labels blocked rows', () => {
    const markup = renderRow(makeAgent({}, { state: 'blocked' }))

    expect(markup).toContain('aria-label="Blocked"')
  })

  it('labels interrupted done rows', () => {
    const markup = renderRow(
      makeAgent(
        { state: 'done', startedAt: 1_000 },
        {
          state: 'done',
          prompt: 'Give me a quick update',
          updatedAt: 2_000,
          stateStartedAt: 2_000,
          stateHistory: [{ state: 'working', prompt: 'Give me a quick update', startedAt: 1_000 }],
          interrupted: true
        }
      )
    )
    expect(markup).toContain('aria-label="Interrupted by user"')
    expect(markup).toContain('interrupted')
  })

  it('reports orchestration child rows at the correct tree level', () => {
    const markup = renderRow(
      makeAgent({
        lineage: {
          depth: 1,
          isFirstSibling: true,
          isLastSibling: true,
          childCount: 0
        }
      })
    )

    expect(markup).toContain('role="treeitem"')
    expect(markup).toContain('aria-level="2"')
  })

  it('labels parent rows with the dispatched child count', () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <DashboardAgentRow
          agent={makeAgent({
            lineage: {
              depth: 0,
              isFirstSibling: true,
              isLastSibling: true,
              childCount: 2
            }
          })}
          onDismiss={vi.fn()}
          onActivate={vi.fn()}
          now={NOW}
          hideExpand
        />
      </TooltipProvider>
    )

    expect(markup).toContain('title="Codex - dispatched 2 agents"')
    expect(markup).toContain('aria-level="1"')
  })

  it('marks child-disclosure rows as lineage manager rows', () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <DashboardAgentRow
          agent={makeAgent()}
          onDismiss={vi.fn()}
          onActivate={vi.fn()}
          now={NOW}
          hideIdentityIcon
          hideExpand
          childAgentCount={2}
          childAgentsExpanded={false}
          onToggleChildAgents={vi.fn()}
        />
      </TooltipProvider>
    )
    expect(markup).toContain('aria-label="Show 2 child agents"')
  })
})
