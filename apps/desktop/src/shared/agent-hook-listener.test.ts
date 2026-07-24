import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { createHookListenerState, normalizeHookPayload } from './agent-hook-listener'
import { makePaneKey } from './stable-pane-id'

const PANE_KEY = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')
const PI_SESSION_FILE = join(tmpdir(), 'pi-session.jsonl')

function codexEvent(payload: Record<string, unknown>) {
  return {
    paneKey: PANE_KEY,
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    env: 'production',
    payload
  }
}

describe('Codex nested hook normalization', () => {
  it('keeps root identity while tracking a child through waiting and stop', () => {
    const state = createHookListenerState()
    const root = normalizeHookPayload(
      state,
      'codex',
      codexEvent({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'root-session',
        prompt: 'Coordinate reviewers',
        model: 'gpt-5.6-sol'
      }),
      'production'
    )
    expect(root?.payload).toMatchObject({ model: 'gpt-5.6-sol', state: 'working' })

    const started = normalizeHookPayload(
      state,
      'codex',
      codexEvent({
        hook_event_name: 'SubagentStart',
        session_id: 'child-session',
        agent_id: 'child-session',
        agent_type: 'reviewer',
        model: 'gpt-5.6-mini'
      }),
      'production'
    )
    expect(started?.providerSession).toBeUndefined()
    expect(started?.payload).toMatchObject({
      model: 'gpt-5.6-sol',
      prompt: 'Coordinate reviewers',
      state: 'working',
      subagents: [
        {
          id: 'child-session',
          agentType: 'reviewer',
          model: 'gpt-5.6-mini',
          state: 'working'
        }
      ]
    })

    const waiting = normalizeHookPayload(
      state,
      'codex',
      codexEvent({ hook_event_name: 'PermissionRequest', agent_id: 'child-session' }),
      'production'
    )
    expect(waiting?.payload.state).toBe('waiting')
    expect(waiting?.payload.subagents?.[0]?.state).toBe('waiting')

    const stopped = normalizeHookPayload(
      state,
      'codex',
      codexEvent({ hook_event_name: 'SubagentStop', agent_id: 'child-session' }),
      'production'
    )
    expect(stopped?.payload.state).toBe('working')
    expect(stopped?.payload.subagents).toBeUndefined()
  })
})

describe('Pi provider session normalization', () => {
  it('captures session identity on turn events', () => {
    const event = normalizeHookPayload(
      createHookListenerState(),
      'pi',
      {
        paneKey: PANE_KEY,
        payload: {
          hook_event_name: 'before_agent_start',
          prompt: 'resume this task',
          session_id: 'pi-session',
          session_file: PI_SESSION_FILE
        }
      },
      'production'
    )

    expect(event?.providerSession).toEqual({
      key: 'session_id',
      id: 'pi-session',
      transcriptPath: PI_SESSION_FILE
    })
    expect(event?.payload).toMatchObject({
      state: 'working',
      prompt: 'resume this task',
      agentType: 'pi'
    })
  })

  it('emits session_start as identity-only and clears prior turn state', () => {
    const state = createHookListenerState()
    normalizeHookPayload(
      state,
      'pi',
      { paneKey: PANE_KEY, payload: { hook_event_name: 'before_agent_start', prompt: 'stale' } },
      'production'
    )

    const sessionStart = normalizeHookPayload(
      state,
      'pi',
      {
        paneKey: PANE_KEY,
        payload: {
          hook_event_name: 'session_start',
          session_id: 'pi-session-2',
          session_file: PI_SESSION_FILE
        }
      },
      'production'
    )
    expect(sessionStart).toMatchObject({
      providerSessionOnly: true,
      providerSession: {
        key: 'session_id',
        id: 'pi-session-2',
        transcriptPath: PI_SESSION_FILE
      },
      payload: { state: 'done', prompt: '', agentType: 'pi' }
    })

    const next = normalizeHookPayload(
      state,
      'pi',
      { paneKey: PANE_KEY, payload: { hook_event_name: 'tool_call', tool_name: 'bash' } },
      'production'
    )
    expect(next?.payload.prompt).toBe('')
  })
})
