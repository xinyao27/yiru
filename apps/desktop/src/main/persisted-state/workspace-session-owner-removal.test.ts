import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '@yiru/workbench-model/workspace'
import { describe, expect, it } from 'vite-plus/test'

import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { TerminalTab, WorkspaceSessionState } from '../../shared/types'
import { worktreeWorkspaceKey } from '../../shared/workspace-scope'
import {
  removeRepoFromWorkspaceSession,
  removeRepoFromWorkspaceSessionsForHost
} from './workspace-session-owner-removal'

function terminalTab(id: string, worktreeId: string): TerminalTab {
  return {
    id,
    ptyId: null,
    worktreeId,
    title: id,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function sessionFor(worktreeId: string): WorkspaceSessionState {
  return {
    ...getDefaultWorkspaceSession(),
    activeRepoId: worktreeId.split('::')[0],
    activeWorktreeId: worktreeId,
    activeWorkspaceKey: worktreeWorkspaceKey(worktreeId),
    lastVisitedAtByWorktreeId: { [worktreeId]: 1 }
  }
}

describe('workspace-session repo removal', () => {
  it('removes terminal, resume, and active state while preserving another repo', () => {
    const removedId = 'repo-a::/work/a'
    const keptId = 'repo-b::/work/b'
    const session: WorkspaceSessionState = {
      ...getDefaultWorkspaceSession(),
      activeRepoId: 'repo-a',
      activeWorktreeId: removedId,
      activeWorkspaceKey: worktreeWorkspaceKey(removedId),
      activeTabId: 'removed-tab',
      tabsByWorktree: {
        [removedId]: [terminalTab('removed-tab', removedId)],
        [keptId]: [terminalTab('kept-tab', keptId)]
      },
      terminalLayoutsByTabId: {
        'removed-tab': { root: null, activeLeafId: null, expandedLeafId: null },
        'kept-tab': { root: null, activeLeafId: null, expandedLeafId: null }
      },
      remoteSessionIdsByTabId: {
        'removed-tab': 'remote-removed',
        'kept-tab': 'remote-kept'
      },
      lastVisitedAtByWorktreeId: { [removedId]: 1, [keptId]: 2 },
      activeWorktreeIdsOnShutdown: [removedId, keptId],
      sleepingAgentSessionsByPaneKey: {
        'removed-tab:pane': {
          paneKey: 'removed-tab:pane',
          tabId: 'removed-tab',
          worktreeId: removedId,
          agent: 'claude',
          providerSession: { key: 'session_id', id: 'removed-session' },
          prompt: '',
          state: 'working',
          capturedAt: 1,
          updatedAt: 1
        },
        'kept-tab:pane': {
          paneKey: 'kept-tab:pane',
          tabId: 'kept-tab',
          worktreeId: keptId,
          agent: 'claude',
          providerSession: { key: 'session_id', id: 'kept-session' },
          prompt: '',
          state: 'working',
          capturedAt: 1,
          updatedAt: 1
        }
      }
    }

    const result = removeRepoFromWorkspaceSession(session, 'repo-a')

    expect(result.activeWorktreeId).toBeNull()
    expect(result.activeRepoId).toBeNull()
    expect(result.activeWorkspaceKey).toBeNull()
    expect(result.activeTabId).toBeNull()
    expect(result.tabsByWorktree).toEqual({ [keptId]: [terminalTab('kept-tab', keptId)] })
    expect(result.terminalLayoutsByTabId).not.toHaveProperty('removed-tab')
    expect(result.remoteSessionIdsByTabId).toEqual({ 'kept-tab': 'remote-kept' })
    expect(result.lastVisitedAtByWorktreeId).toEqual({ [keptId]: 2 })
    expect(result.activeWorktreeIdsOnShutdown).toEqual([keptId])
    expect(result.sleepingAgentSessionsByPaneKey).not.toHaveProperty('removed-tab:pane')
    expect(result.sleepingAgentSessionsByPaneKey).toHaveProperty('kept-tab:pane')
  })

  it('prunes only the requested host partition while the repo survives elsewhere', () => {
    const worktreeId = 'shared-repo::/same/path'
    const sshA = 'ssh:a' as ExecutionHostId
    const sshB = 'ssh:b' as ExecutionHostId
    const legacy = sessionFor(worktreeId)
    const sessions = { [sshA]: sessionFor(worktreeId), [sshB]: sessionFor(worktreeId) }

    const sshResult = removeRepoFromWorkspaceSessionsForHost({
      workspaceSession: legacy,
      workspaceSessionsByHostId: sessions,
      repoId: 'shared-repo',
      hostId: sshA
    })
    expect(sshResult.workspaceSession.activeWorktreeId).toBe(worktreeId)
    expect(sshResult.workspaceSession.activeRepoId).toBe('shared-repo')
    expect(sshResult.workspaceSessionsByHostId?.[sshA]?.activeWorktreeId).toBeNull()
    expect(sshResult.workspaceSessionsByHostId?.[sshA]?.activeRepoId).toBeNull()
    expect(sshResult.workspaceSessionsByHostId?.[sshB]?.activeWorktreeId).toBe(worktreeId)

    const localResult = removeRepoFromWorkspaceSessionsForHost({
      workspaceSession: legacy,
      workspaceSessionsByHostId: sessions,
      repoId: 'shared-repo',
      hostId: LOCAL_EXECUTION_HOST_ID
    })
    expect(localResult.workspaceSession.activeWorktreeId).toBeNull()
    expect(localResult.workspaceSession.activeRepoId).toBeNull()
    expect(localResult.workspaceSessionsByHostId?.[sshA]?.activeWorktreeId).toBe(worktreeId)
    expect(localResult.workspaceSessionsByHostId?.[sshB]?.activeWorktreeId).toBe(worktreeId)
  })

  it('prunes legacy and every host partition after the last repo owner is removed', () => {
    const worktreeId = 'shared-repo::/same/path'
    const sshA = 'ssh:a' as ExecutionHostId
    const sshB = 'ssh:b' as ExecutionHostId
    const result = removeRepoFromWorkspaceSessionsForHost({
      workspaceSession: sessionFor(worktreeId),
      workspaceSessionsByHostId: {
        [sshA]: sessionFor(worktreeId),
        [sshB]: sessionFor(worktreeId)
      },
      repoId: 'shared-repo',
      hostId: null
    })

    expect(result.workspaceSession.activeWorktreeId).toBeNull()
    expect(result.workspaceSession.activeRepoId).toBeNull()
    expect(result.workspaceSessionsByHostId?.[sshA]?.activeWorktreeId).toBeNull()
    expect(result.workspaceSessionsByHostId?.[sshA]?.activeRepoId).toBeNull()
    expect(result.workspaceSessionsByHostId?.[sshB]?.activeWorktreeId).toBeNull()
  })
})
