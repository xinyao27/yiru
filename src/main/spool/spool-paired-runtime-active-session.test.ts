import { describe, expect, it } from 'vitest'
import { SpoolPairedRuntimeLiveSessionSchema } from '../../shared/spool/spool-paired-runtime-session-contract'
import { projectPairedRuntimeLiveSessions } from '../runtime/rpc/methods/spool-host-session-projection'
import { projectPairedRuntimeLiveTab } from './spool-paired-runtime-session-projection'
import { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'

describe('Spool paired-runtime active sessions', () => {
  it('keeps responses from older paired hosts compatible', () => {
    expect(
      SpoolPairedRuntimeLiveSessionSchema.parse({
        terminalRef: 'terminal-legacy',
        title: 'Legacy session',
        provider: 'other',
        providerSessionId: null,
        sessionKind: 'terminal',
        agent: null,
        sessionKey: null
      }).isActive
    ).toBe(false)
  })

  it('preserves the owner-active flag across the downstream session projection', async () => {
    const result = await projectPairedRuntimeLiveSessions(
      {
        listMobileSessionTabs: async () => ({
          worktree: 'worktree-one',
          publicationEpoch: 'publication-one',
          snapshotVersion: 1,
          activeGroupId: null,
          activeTabId: 'tab-active',
          activeTabType: 'terminal',
          tabs: [
            {
              type: 'terminal' as const,
              id: 'tab-active',
              title: 'Current session',
              parentTabId: 'tab-active',
              leafId: 'leaf-active',
              isActive: true,
              status: 'ready' as const,
              terminal: 'terminal-active',
              worktreeInstanceId: 'instance-one'
            }
          ]
        })
      },
      new SpoolTerminalSessionBindings(),
      {
        kind: 'git',
        worktreeId: 'worktree-one',
        instanceId: 'instance-one',
        projectId: 'project-one',
        repoId: 'repo-one',
        executionHostId: 'local',
        connectionId: null,
        worktreePath: '/repo/worktree-one',
        localWslDistro: null,
        actualHostScope: 'paired-owner',
        spoolIncarnationId: '00000000-0000-4000-8000-000000000001'
      }
    )

    expect(result.sessions).toMatchObject([{ terminalRef: 'terminal-active', isActive: true }])
  })

  it('preserves the active flag when rebuilding the outer mobile tab', () => {
    const session = {
      terminalRef: 'terminal-active',
      title: 'Current session',
      provider: 'other' as const,
      providerSessionId: null,
      sessionKind: 'terminal' as const,
      agent: null,
      sessionKey: null,
      isActive: true
    }

    expect(projectPairedRuntimeLiveTab(session, 'instance-one')).toMatchObject({
      terminal: 'terminal-active',
      isActive: true
    })
  })
})
