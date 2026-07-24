import {
  AGENT_MODEL_MAX_LENGTH,
  AGENT_STATUS_MAX_SUBAGENTS,
  AGENT_TYPE_MAX_LENGTH
} from '@yiru/workbench-model/agent'
import { describe, expect, it } from 'vite-plus/test'

import {
  codexRosterToSnapshots,
  finishCodexSubagent,
  upsertCodexSubagent,
  type CodexSubagentRoster
} from './codex-subagent-roster'

describe('Codex subagent roster', () => {
  it('normalizes retained identity fields before storing them', () => {
    const roster: CodexSubagentRoster = new Map()

    upsertCodexSubagent(
      roster,
      ' child-1 ',
      {
        agentType: `reviewer\n${'x'.repeat(AGENT_TYPE_MAX_LENGTH * 2)}`,
        model: `gpt-model-${'x'.repeat(AGENT_MODEL_MAX_LENGTH * 2)}`,
        state: 'working'
      },
      10
    )

    const snapshot = codexRosterToSnapshots(roster)?.[0]
    expect([...roster.keys()]).toEqual(['child-1'])
    expect(snapshot?.agentType).toHaveLength(AGENT_TYPE_MAX_LENGTH)
    expect(snapshot?.agentType).not.toContain('\n')
    expect(snapshot?.model).toHaveLength(AGENT_MODEL_MAX_LENGTH)

    finishCodexSubagent(roster, ' child-1 ')
    expect(roster.size).toBe(0)
  })

  it('bounds storage while admitting a replacement after a child stops', () => {
    const roster: CodexSubagentRoster = new Map()
    for (let index = 0; index <= AGENT_STATUS_MAX_SUBAGENTS; index += 1) {
      upsertCodexSubagent(roster, `child-${index}`, { state: 'working' }, index)
    }

    expect(roster.size).toBe(AGENT_STATUS_MAX_SUBAGENTS)
    finishCodexSubagent(roster, 'child-0')
    upsertCodexSubagent(roster, 'replacement', { state: 'waiting' }, 100)
    expect(codexRosterToSnapshots(roster)?.at(-1)).toMatchObject({
      id: 'replacement',
      state: 'waiting'
    })
  })
})
