import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentStatusEntry } from '@yiru/workbench-model/agent'
import { describe, expect, it } from 'vite-plus/test'

import type { TerminalLayoutSnapshot, TerminalTab } from '../../../shared/types'
import {
  DEFAULT_AGENT_HIBERNATION_IDLE_MS,
  planAgentHibernationCandidates,
  type AgentHibernationPlannerSnapshot
} from './agent-hibernation-planner'

const NOW = 2_000_000
const OLD = NOW - DEFAULT_AGENT_HIBERNATION_IDLE_MS - 1
const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = `tab-1:${LEAF_ID}`
const AGENT_TYPE = 'pi' as const

function terminalTab(): TerminalTab {
  return {
    id: 'tab-1',
    ptyId: null,
    worktreeId: 'worktree-background',
    title: AGENT_TYPE,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function terminalLayout(): TerminalLayoutSnapshot {
  return {
    root: { type: 'leaf', leafId: LEAF_ID },
    activeLeafId: LEAF_ID,
    expandedLeafId: null,
    ptyIdsByLeafId: { [LEAF_ID]: 'pty-1' }
  }
}

describe('Pi hibernation planning', () => {
  it('does not treat live resume identity as an already-hibernated pane', () => {
    const providerSession = {
      key: 'session_id' as const,
      id: 'pi-session-1',
      transcriptPath: join(tmpdir(), 'yiru-pi-session-1.jsonl')
    }
    const entry: AgentStatusEntry = {
      state: 'done',
      prompt: 'finished turn',
      updatedAt: OLD,
      stateStartedAt: OLD,
      paneKey: PANE_KEY,
      tabId: 'tab-1',
      worktreeId: 'worktree-background',
      agentType: AGENT_TYPE,
      providerSession,
      stateHistory: []
    }
    const snapshot: AgentHibernationPlannerSnapshot = {
      settings: {
        experimentalAgentHibernation: true,
        agentHibernationIdleMs: DEFAULT_AGENT_HIBERNATION_IDLE_MS
      },
      activeWorktreeId: 'worktree-active',
      foregroundTerminalTabIds: [],
      tabsByWorktree: { 'worktree-background': [terminalTab()] },
      terminalLayoutsByTabId: { 'tab-1': terminalLayout() },
      ptyIdsByTabId: { 'tab-1': ['pty-1'] },
      mobileLockedPtyIds: [],
      agentStatusByPaneKey: { [PANE_KEY]: entry },
      sleepingAgentSessionsByPaneKey: {
        [PANE_KEY]: {
          paneKey: PANE_KEY,
          tabId: 'tab-1',
          worktreeId: 'worktree-background',
          agent: AGENT_TYPE,
          providerSession,
          prompt: '',
          state: 'working',
          capturedAt: OLD,
          updatedAt: OLD,
          origin: 'live'
        }
      },
      lastTerminalInputAtByPaneKey: {},
      foregroundTerminalLastSeenAtByTabId: {},
      now: NOW
    }

    expect(planAgentHibernationCandidates(snapshot).map((candidate) => candidate.paneKey)).toEqual([
      PANE_KEY
    ])
  })
})
