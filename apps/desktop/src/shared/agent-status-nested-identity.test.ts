import { agentSubagentsEqual, normalizeAgentStatusPayload } from '@yiru/workbench-model/agent'
import { describe, expect, it } from 'vite-plus/test'

describe('agent status nested identity', () => {
  it('normalizes root and child model identity with actionable child states', () => {
    const payload = normalizeAgentStatusPayload({
      state: 'waiting',
      agentType: 'codex',
      model: ' gpt-5.6-sol\n',
      subagents: [
        {
          id: 'child-1',
          agentType: 'reviewer',
          model: ' gpt-5.6-mini ',
          state: 'waiting',
          startedAt: 10
        }
      ]
    })

    expect(payload?.model).toBe('gpt-5.6-sol')
    expect(payload?.subagents).toEqual([
      {
        id: 'child-1',
        agentType: 'reviewer',
        model: 'gpt-5.6-mini',
        description: undefined,
        state: 'waiting',
        startedAt: 10
      }
    ])
  })

  it('treats child model changes as roster changes', () => {
    const child = { id: 'child-1', state: 'working' as const, startedAt: 10 }

    expect(agentSubagentsEqual([child], [{ ...child }])).toBe(true)
    expect(agentSubagentsEqual([child], [{ ...child, model: 'gpt-5.6-mini' }])).toBe(false)
  })
})
