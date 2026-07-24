import type { AgentStatusEntry } from '@yiru/workbench-model/agent'
import { describe, expect, it } from 'vite-plus/test'

import type { TerminalTab } from '../../../../shared/types'
import { buildSubagentChildRows } from './worktree-subagent-child-rows'

const TAB = { id: 'tab-1', worktreeId: 'wt-1' } as TerminalTab

function parentEntry(subagents: AgentStatusEntry['subagents']): AgentStatusEntry {
  return {
    state: 'waiting',
    prompt: 'coordinate reviewers',
    updatedAt: 20,
    stateStartedAt: 10,
    agentType: 'codex',
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    stateHistory: [],
    subagents
  }
}

describe('buildSubagentChildRows', () => {
  it('surfaces Codex child state, role, and model', () => {
    const [row] = buildSubagentChildRows({
      parentEntry: parentEntry([
        {
          id: 'child-1',
          state: 'waiting',
          startedAt: 15,
          agentType: 'reviewer',
          model: 'gpt-5.6-mini'
        }
      ]),
      tab: TAB,
      parentIsFresh: true
    })

    expect(row).toMatchObject({
      state: 'waiting',
      agentType: 'reviewer',
      activationPaneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
      entry: { prompt: 'reviewer', model: 'gpt-5.6-mini' }
    })
  })

  it('preserves Claude idle children without presenting them as active', () => {
    const [row] = buildSubagentChildRows({
      parentEntry: {
        ...parentEntry([{ id: 'claude-child', state: 'idle', startedAt: 15 }]),
        agentType: 'claude'
      },
      tab: TAB,
      parentIsFresh: true
    })

    expect(row?.state).toBe('idle')
    expect(row?.entry.state).toBe('done')
  })
})
