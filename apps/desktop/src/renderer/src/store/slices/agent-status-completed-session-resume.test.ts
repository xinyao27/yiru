import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentProviderSessionMetadata, ResumableTuiAgent } from '@yiru/workbench-model/agent'
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
        setGeneratedTabTitleFromAgentPrompt: () => {},
        refreshGitHubForWorktreeIfStale: () => {},
        sortEpoch: 0
      }) as unknown as AppState
  )
}

const COMPLETED_RESUME_CASES: readonly [
  agent: ResumableTuiAgent,
  title: string,
  providerSession: AgentProviderSessionMetadata
][] = [
  ['claude', 'Claude', { key: 'session_id', id: 'claude-session-1' }],
  ['codex', 'Codex', { key: 'session_id', id: 'codex-session-1' }],
  [
    'pi',
    'Pi',
    {
      key: 'session_id',
      id: 'pi-session-1',
      transcriptPath: join(tmpdir(), 'yiru-pi-session-1.jsonl')
    }
  ],
  ['omp', 'OMP', { key: 'session_id', id: 'omp-session-1' }]
]

describe('completed resumable agent persistence', () => {
  it.each(COMPLETED_RESUME_CASES)(
    'retains and quit-captures a finished %s provider session',
    (agent, title, providerSession) => {
      const store = createTestStore()
      const paneKey = 'tab-1:leaf-1'
      for (const [state, updatedAt] of [
        ['working', 10],
        ['done', 20]
      ] as const) {
        store
          .getState()
          .setAgentStatus(
            paneKey,
            { state, prompt: 'finish the task', agentType: agent },
            title,
            { updatedAt, stateStartedAt: 10 },
            { tabId: 'tab-1', worktreeId: 'worktree-1', connectionId: 'ssh-1' },
            { providerSession }
          )
      }

      expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]).toMatchObject({
        agent,
        providerSession,
        connectionId: 'ssh-1',
        origin: 'live',
        state: 'working'
      })

      store.getState().captureAllSleepingAgentSessions('quit')
      expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]).toMatchObject({
        agent,
        providerSession,
        origin: 'quit',
        state: 'working'
      })
    }
  )
})
