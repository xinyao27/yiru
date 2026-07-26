import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { SleepingAgentSessionRecord } from '@yiru/workbench-model/agent'
import { describe, expect, it } from 'vite-plus/test'

import type { AppState } from '@/store'

import { recordPaneIsOwnedByPreservedPane } from './sleeping-agent-pane-ownership'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const TAB_ID = 'pi-tab'
const WORKTREE_ID = 'worktree-background'
const PANE_KEY = `${TAB_ID}:${LEAF_ID}`

function livePiRecord(): SleepingAgentSessionRecord {
  return {
    paneKey: PANE_KEY,
    tabId: TAB_ID,
    worktreeId: WORKTREE_ID,
    agent: 'pi',
    providerSession: {
      key: 'session_id',
      id: 'pi-session-1',
      transcriptPath: join(tmpdir(), 'yiru-pi-session-1.jsonl')
    },
    prompt: '',
    state: 'working',
    capturedAt: 1,
    updatedAt: 1,
    origin: 'live'
  }
}

function backgroundPaneState(args: { livePtyIds: string[]; layoutPtyId: string }): AppState {
  return {
    activeWorktreeId: WORKTREE_ID,
    activeTabType: 'editor',
    activeTabId: null,
    groupsByWorktree: {},
    unifiedTabsByWorktree: {},
    tabsByWorktree: {
      [WORKTREE_ID]: [
        {
          id: TAB_ID,
          ptyId: args.livePtyIds[0] ?? null,
          worktreeId: WORKTREE_ID,
          title: TAB_ID,
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    ptyIdsByTabId: { [TAB_ID]: args.livePtyIds },
    terminalLayoutsByTabId: {
      [TAB_ID]: {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: args.layoutPtyId }
      }
    },
    sleepingAgentSessionsByPaneKey: { [PANE_KEY]: livePiRecord() }
  } as unknown as AppState
}

describe('sleeping agent pane ownership', () => {
  it('keeps a live background Pi pane as the session owner', () => {
    const state = backgroundPaneState({ livePtyIds: ['pty-live'], layoutPtyId: 'pty-live' })

    expect(recordPaneIsOwnedByPreservedPane(livePiRecord(), state)).toBe(true)
  })

  it('does not mistake a stale layout PTY binding for runtime liveness', () => {
    const state = backgroundPaneState({ livePtyIds: ['pty-new'], layoutPtyId: 'pty-stale' })

    expect(recordPaneIsOwnedByPreservedPane(livePiRecord(), state)).toBe(false)
  })
})
