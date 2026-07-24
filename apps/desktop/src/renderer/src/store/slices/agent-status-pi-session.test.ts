import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentStatusEntry, SleepingAgentSessionRecord } from '@yiru/workbench-model/agent'
import { describe, expect, it } from 'vite-plus/test'
import { createStore } from 'zustand/vanilla'

import type { AppState } from '../types'
import { createAgentStatusSlice } from './agent-status'

function createTestStore() {
  return createStore<AppState>()(
    (...args) =>
      ({
        ...createAgentStatusSlice(...args),
        tabsByWorktree: {},
        acknowledgedAgentsByPaneKey: {},
        unreadAgentCompletionPanes: {},
        lastTerminalInputAtByPaneKey: {},
        sortEpoch: 0
      }) as AppState
  )
}

function providerSession(fileName: string) {
  return {
    key: 'session_id' as const,
    id: 'pi-session-1',
    transcriptPath: join(tmpdir(), fileName)
  }
}

describe('Pi provider session persistence', () => {
  it('records durable identity without fabricating visible turn status', () => {
    const store = createTestStore()
    const session = providerSession('yiru-pi-session-1.jsonl')

    store
      .getState()
      .recordAgentProviderSession(
        'tab-1:leaf-1',
        'pi',
        session,
        { updatedAt: 20 },
        { tabId: 'tab-1', worktreeId: 'worktree-1', connectionId: 'ssh-1' }
      )

    expect(store.getState().agentStatusByPaneKey['tab-1:leaf-1']).toBeUndefined()
    expect(store.getState().sleepingAgentSessionsByPaneKey['tab-1:leaf-1']).toMatchObject({
      agent: 'pi',
      providerSession: session,
      connectionId: 'ssh-1',
      state: 'working',
      origin: 'live'
    })
  })

  it('keeps completed Pi identity through quit capture and periodic races', () => {
    const store = createTestStore()
    const paneKey = 'tab-1:leaf-1'
    const session = providerSession('yiru-pi-session-2.jsonl')
    const record: SleepingAgentSessionRecord = {
      paneKey,
      tabId: 'tab-1',
      worktreeId: 'worktree-1',
      agent: 'pi',
      providerSession: session,
      prompt: '',
      state: 'working',
      capturedAt: 20,
      updatedAt: 20,
      origin: 'live'
    }
    const entry: AgentStatusEntry = {
      paneKey,
      tabId: 'tab-1',
      worktreeId: 'worktree-1',
      agentType: 'pi',
      providerSession: session,
      state: 'done',
      prompt: 'finished turn',
      updatedAt: 30,
      stateStartedAt: 30,
      stateHistory: []
    }
    store.setState({
      agentStatusByPaneKey: { [paneKey]: entry },
      sleepingAgentSessionsByPaneKey: { [paneKey]: record }
    })

    store.getState().captureAllSleepingAgentSessions('periodic')
    expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]).toBe(record)

    store.getState().captureAllSleepingAgentSessions('quit')
    const quitRecord = store.getState().sleepingAgentSessionsByPaneKey[paneKey]
    expect(quitRecord).toMatchObject({ providerSession: session, origin: 'quit' })

    store.getState().captureAllSleepingAgentSessions('periodic')
    expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]).toBe(quitRecord)
  })

  it('does not reuse launch config when only the Pi session file changes', () => {
    const store = createTestStore()
    const paneKey = 'tab-1:leaf-1'
    store.setState({
      sleepingAgentSessionsByPaneKey: {
        [paneKey]: {
          paneKey,
          tabId: 'tab-1',
          worktreeId: 'worktree-1',
          agent: 'pi',
          providerSession: providerSession('yiru-pi-old.jsonl'),
          prompt: '',
          state: 'working',
          capturedAt: 10,
          updatedAt: 10,
          launchConfig: { agentArgs: '--model old', agentEnv: { PI_PROFILE: 'old' } },
          origin: 'live'
        }
      }
    })

    store
      .getState()
      .recordAgentProviderSession(
        paneKey,
        'pi',
        providerSession('yiru-pi-new.jsonl'),
        { updatedAt: 20 },
        { tabId: 'tab-1', worktreeId: 'worktree-1' }
      )

    expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]?.launchConfig).toBeUndefined()
  })
})
