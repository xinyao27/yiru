import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AppState } from '@/store/types'

import { useAgentRowConversationName } from './use-agent-row-conversation-name'
import type { DashboardAgentRow } from './use-dashboard-data'

const storeState = vi.hoisted(() => ({
  current: { settings: {}, tabsByWorktree: {} } as {
    settings: Record<string, unknown>
    tabsByWorktree: Record<string, unknown[]>
  }
}))

// Why: the mocked selector makes this store-backed hook a pure policy function for focused tests.
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: AppState) => unknown) =>
    selector(storeState.current as unknown as AppState)
}))

function makeAgent(overrides: Partial<DashboardAgentRow> = {}): DashboardAgentRow {
  return {
    paneKey: 'tab-1:leaf-1',
    entry: { prompt: 'fix the sidebar' },
    tab: { id: 'tab-1', worktreeId: 'wt-1', customTitle: 'Patient sync spike', title: '' },
    agentType: 'claude',
    state: 'working',
    startedAt: 0,
    ...overrides
  } as DashboardAgentRow
}

beforeEach(() => {
  storeState.current = { settings: {}, tabsByWorktree: {} }
})

describe('useAgentRowConversationName', () => {
  it('prefers the live store tab over a stale row snapshot', () => {
    storeState.current = {
      settings: {},
      tabsByWorktree: {
        'wt-1': [{ id: 'tab-1', worktreeId: 'wt-1', customTitle: 'Renamed later', title: '' }]
      }
    }

    expect(useAgentRowConversationName(makeAgent())).toBe('Renamed later')
  })

  it('never lets an in-process child inherit its parent tab name', () => {
    const tabsByWorktree = new Proxy(
      {},
      {
        get: () => {
          throw new Error('subagent rows must not read the parent tab')
        }
      }
    )
    storeState.current = { settings: {}, tabsByWorktree }

    expect(useAgentRowConversationName(makeAgent({ rowSource: 'subagent' }))).toBeNull()
  })

  it('does not inherit a same-tab lineage parent name', () => {
    const agent = makeAgent({
      entry: {
        prompt: 'child prompt',
        orchestration: {
          parentPaneKey: 'tab-1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        }
      },
      lineage: { depth: 1, isFirstSibling: true, isLastSibling: true, childCount: 0 }
    } as Partial<DashboardAgentRow>)

    expect(useAgentRowConversationName(agent)).toBeNull()
  })

  it('uses generated names only while generated tab titles are enabled', () => {
    const agent = makeAgent({
      tab: { customTitle: null, title: '', generatedTitle: 'Fix intake flow' }
    } as Partial<DashboardAgentRow>)
    expect(useAgentRowConversationName(agent)).toBeNull()

    storeState.current = {
      settings: { tabAutoGenerateTitle: true },
      tabsByWorktree: {}
    }
    expect(useAgentRowConversationName(agent)).toBe('Fix intake flow')
  })
})
