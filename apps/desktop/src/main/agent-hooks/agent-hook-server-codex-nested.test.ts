import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))

import { makePaneKey } from '../../shared/stable-pane-id'
import { AgentHookServer } from './server'

const PANE_KEY = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

function child(id: string) {
  return { id, state: 'working' as const, startedAt: 10 }
}

describe('AgentHookServer remote Codex hierarchy', () => {
  it('preserves siblings and root identity across relay listener restarts', () => {
    const server = new AgentHookServer()
    const providerSession = { key: 'session_id' as const, id: 'root-session' }
    server.ingestRemote(
      {
        paneKey: PANE_KEY,
        providerSession,
        payload: {
          state: 'working',
          prompt: 'coordinate reviewers',
          agentType: 'codex',
          model: 'gpt-5.6-sol'
        }
      },
      'conn-1'
    )
    server.ingestRemote(
      {
        paneKey: PANE_KEY,
        hookEventName: 'SubagentStart',
        toolAgentId: 'child-a',
        payload: {
          state: 'working',
          prompt: 'coordinate reviewers',
          agentType: 'codex',
          subagents: [child('child-a'), child('child-b')]
        }
      },
      'conn-1'
    )

    // A restarted relay has forgotten the sibling roster and sends only the lifecycle event.
    server.ingestRemote(
      {
        paneKey: PANE_KEY,
        hookEventName: 'SubagentStop',
        toolAgentId: 'child-a',
        payload: { state: 'working', prompt: 'coordinate reviewers', agentType: 'codex' }
      },
      'conn-1'
    )

    expect(server.getStatusSnapshot()[0]).toMatchObject({
      state: 'working',
      model: 'gpt-5.6-sol',
      providerSession,
      subagents: [expect.objectContaining({ id: 'child-b' })]
    })
  })

  it('does not carry a roster into a replacement transport authority', () => {
    const server = new AgentHookServer()
    server.ingestRemote(
      {
        paneKey: PANE_KEY,
        hookEventName: 'SubagentStart',
        toolAgentId: 'old-child',
        payload: {
          state: 'working',
          prompt: '',
          agentType: 'codex',
          subagents: [child('old-child')]
        }
      },
      'conn-1'
    )
    server.ingestRemote(
      {
        paneKey: PANE_KEY,
        hookEventName: 'SubagentStart',
        toolAgentId: 'new-child',
        payload: {
          state: 'working',
          prompt: '',
          agentType: 'codex',
          subagents: [child('new-child')]
        }
      },
      'conn-2'
    )

    expect(server.getStatusSnapshot()[0]?.subagents).toEqual([child('new-child')])
  })
})
