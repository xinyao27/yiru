import { describe, expect, it } from 'vite-plus/test'

import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import type { Tab, TabGroup, TerminalTab } from '../../../shared/types'
import {
  buildSanitizedTabsByWorktree,
  buildSanitizedTerminalLayoutsByTabId
} from './workspace-session'
import { buildPersistedUnifiedTabSessionData } from './workspace-session-unified-tabs'

const groupId = 'floating-group'

function createTerminalTab(id: string, isGlobalAssistant = false): TerminalTab {
  return {
    id,
    ptyId: `${id}-pty`,
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    title: id,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...(isGlobalAssistant ? { isGlobalAssistant: true } : {})
  }
}

function createUnifiedTab(id: string, isGlobalAssistant = false): Tab {
  return {
    id,
    entityId: id,
    groupId,
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    contentType: 'terminal',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...(isGlobalAssistant ? { isGlobalAssistant: true } : {})
  }
}

describe('Global Assistant session persistence', () => {
  it('omits the runtime-owned assistant tab and keeps ordinary floating tabs', () => {
    const assistant = createTerminalTab('assistant-tab', true)
    const ordinary = createTerminalTab('ordinary-tab')
    const tabsByWorktree = {
      [FLOATING_TERMINAL_WORKTREE_ID]: [assistant, ordinary]
    }

    expect(buildSanitizedTabsByWorktree(tabsByWorktree)).toEqual({
      [FLOATING_TERMINAL_WORKTREE_ID]: [ordinary]
    })
    const persistedLayouts = buildSanitizedTerminalLayoutsByTabId(tabsByWorktree, {
      [assistant.id]: {
        root: null,
        activeLeafId: null,
        expandedLeafId: null
      },
      [ordinary.id]: {
        root: null,
        activeLeafId: null,
        expandedLeafId: null
      }
    })
    expect(persistedLayouts).toHaveProperty(ordinary.id)
    expect(persistedLayouts).not.toHaveProperty(assistant.id)

    const group: TabGroup = {
      id: groupId,
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      activeTabId: assistant.id,
      tabOrder: [assistant.id, ordinary.id]
    }
    const unified = buildPersistedUnifiedTabSessionData({
      unifiedTabsByWorktree: {
        [FLOATING_TERMINAL_WORKTREE_ID]: [
          createUnifiedTab(assistant.id, true),
          createUnifiedTab(ordinary.id)
        ]
      },
      groupsByWorktree: { [FLOATING_TERMINAL_WORKTREE_ID]: [group] },
      layoutByWorktree: {
        [FLOATING_TERMINAL_WORKTREE_ID]: { type: 'leaf', groupId }
      },
      activeGroupIdByWorktree: { [FLOATING_TERMINAL_WORKTREE_ID]: groupId }
    })

    expect(unified.unifiedTabs?.[FLOATING_TERMINAL_WORKTREE_ID]).toEqual([
      createUnifiedTab(ordinary.id)
    ])
    expect(unified.tabGroups?.[FLOATING_TERMINAL_WORKTREE_ID]?.[0]?.tabOrder).toEqual([ordinary.id])
  })
})
