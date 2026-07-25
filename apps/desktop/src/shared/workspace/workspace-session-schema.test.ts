import { describe, expect, it } from 'vite-plus/test'

import { parseWorkspaceSession } from './workspace-session-schema'

const worktreeId = 'repo-id::/workspace'

function createSessionWithContentType(contentType: string): unknown {
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    unifiedTabs: {
      [worktreeId]: [
        {
          id: 'terminal-tab',
          entityId: 'terminal-tab',
          groupId: 'group-id',
          worktreeId,
          contentType: 'terminal',
          label: 'Terminal 1',
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        },
        {
          id: 'retired-tab',
          entityId: contentType,
          groupId: 'group-id',
          worktreeId,
          contentType,
          label: contentType,
          customLabel: null,
          color: null,
          sortOrder: 1,
          createdAt: 2
        }
      ]
    }
  }
}

describe('parseWorkspaceSession', () => {
  it('drops retired sidebar tabs without discarding the workspace session', () => {
    const result = parseWorkspaceSession(createSessionWithContentType('explorer'))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.unifiedTabs?.[worktreeId]).toHaveLength(1)
      expect(result.value.unifiedTabs?.[worktreeId]?.[0]?.contentType).toBe('terminal')
    }
  })

  it('still rejects unknown tab content types', () => {
    const result = parseWorkspaceSession(createSessionWithContentType('future-surface'))

    expect(result.ok).toBe(false)
  })
})
