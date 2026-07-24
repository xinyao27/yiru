import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { parseWorkspaceSession } from './workspace-session-schema'

const PI_SESSION_FILE = join(tmpdir(), 'pi-session.jsonl')

function sessionWithPi(providerSession: Record<string, unknown>): Record<string, unknown> {
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    sleepingAgentSessionsByPaneKey: {
      'tab1:pane-1': {
        paneKey: 'tab1:pane-1',
        tabId: 'tab1',
        worktreeId: 'wt',
        agent: 'pi',
        providerSession,
        prompt: '',
        state: 'working',
        capturedAt: 10,
        updatedAt: 10,
        origin: 'live'
      }
    }
  }
}

describe('workspace-session Pi sleeping agents', () => {
  it('preserves the Pi session file through hydration', () => {
    const result = parseWorkspaceSession(
      sessionWithPi({ key: 'session_id', id: 'pi-session', transcriptPath: PI_SESSION_FILE })
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.sleepingAgentSessionsByPaneKey?.['tab1:pane-1']?.providerSession).toEqual(
        {
          key: 'session_id',
          id: 'pi-session',
          transcriptPath: PI_SESSION_FILE
        }
      )
    }
  })

  it('drops legacy Pi records that have no resumable session file', () => {
    const result = parseWorkspaceSession(
      sessionWithPi({ key: 'session_id', id: 'pi-session-without-file' })
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.sleepingAgentSessionsByPaneKey).toBeUndefined()
    }
  })
})

describe('workspace-session OMP sleeping agents', () => {
  it('preserves the provider id and exact resume path through hydration', () => {
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      sleepingAgentSessionsByPaneKey: {
        'tab1:pane-1': {
          paneKey: 'tab1:pane-1',
          tabId: 'tab1',
          worktreeId: 'wt',
          agent: 'omp',
          providerSession: { key: 'session_id', id: 'omp-session' },
          prompt: '',
          state: 'working',
          capturedAt: 10,
          updatedAt: 10,
          launchConfig: {
            agentArgs: '',
            agentEnv: {},
            ompResumeFilePath: '/custom/omp/session.jsonl'
          },
          origin: 'live'
        }
      }
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(
        result.value.sleepingAgentSessionsByPaneKey?.['tab1:pane-1']?.launchConfig
      ).toMatchObject({ ompResumeFilePath: '/custom/omp/session.jsonl' })
    }
  })
})
