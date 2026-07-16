import { describe, expect, it } from 'vitest'
import type { SpoolRemoteDesktop } from '../../../../shared/spool/spool-catalog-contract'
import { projectSpoolSidebarRows } from './spool-sidebar-rows'
import { getSpoolWorktreeDisplayTitle } from './spool-worktree-display-title'

function createDesktop(): SpoolRemoteDesktop {
  return {
    desktopRef: 'desktop-chen',
    tailnetNodeId: 'node-id-chen',
    userDisplayName: 'chen',
    nodeDisplayName: 'chen-macbook',
    connectionEpoch: 3,
    connectionStatus: 'connected',
    catalog: {
      protocolVersion: 1,
      ownerRuntimeId: 'runtime-chen',
      catalogRevision: 7,
      quota: [],
      projects: [
        {
          projectRef: 'github:paperboytm/orca',
          name: 'orca',
          worktrees: [
            {
              kind: 'git',
              worktreeRef: 'worktree-one',
              shareEpoch: 'share-one',
              name: 'worktree-one',
              branch: 'feature/one',
              sessions: [
                {
                  kind: 'agent',
                  agent: 'codex',
                  sessionRef: 'session-one',
                  title: 'Implement the feature'
                }
              ],
              sessionCatalog: {
                status: 'complete',
                nextCursor: null
              }
            }
          ]
        }
      ]
    }
  }
}

describe('projectSpoolSidebarRows', () => {
  it('projects remote worktrees directly with an owner-prefixed title', () => {
    const rows = projectSpoolSidebarRows({
      desktops: [createDesktop()],
      expandedWorktreeRefsByDesktop: new Map(),
      activeRoute: null
    })

    expect(rows).toEqual([
      expect.objectContaining({
        type: 'spool-worktree',
        desktopRef: 'desktop-chen',
        projectRef: 'github:paperboytm/orca',
        projectIdentityKey: 'github:paperboytm/orca',
        worktreeRef: 'worktree-one',
        desktop: expect.objectContaining({ userDisplayName: 'chen' }),
        name: 'worktree-one'
      })
    ])
    const row = rows[0]
    expect(
      row?.type === 'spool-worktree' &&
        getSpoolWorktreeDisplayTitle(row.desktop.userDisplayName, row.name)
    ).toBe("chen's worktree-one")
  })

  it('keeps connection feedback without restoring the desktop hierarchy', () => {
    const desktop = { ...createDesktop(), connectionStatus: 'disconnected' as const, catalog: null }

    const rows = projectSpoolSidebarRows({
      desktops: [desktop],
      expandedWorktreeRefsByDesktop: new Map(),
      activeRoute: null
    })

    expect(rows).toEqual([
      expect.objectContaining({
        type: 'spool-desktop-status',
        desktopRef: 'desktop-chen',
        desktop: expect.objectContaining({
          userDisplayName: 'chen',
          connectionStatus: 'disconnected'
        })
      })
    ])
  })

  it('carries desktop quota into each flattened worktree owner context', () => {
    const desktop = createDesktop()
    if (!desktop.catalog) {
      throw new Error('Expected catalog fixture')
    }
    const quota = [
      {
        provider: 'codex' as const,
        status: 'unavailable' as const,
        updatedAt: null,
        fiveHour: null,
        sevenDay: null
      }
    ]
    desktop.catalog = { ...desktop.catalog, quota }

    const rows = projectSpoolSidebarRows({
      desktops: [desktop],
      expandedWorktreeRefsByDesktop: new Map(),
      activeRoute: null
    })

    expect(rows[0]?.type === 'spool-worktree' && rows[0].desktop.quota).toBe(quota)
  })

  it('projects sessions only when their worktree is expanded', () => {
    const desktop = createDesktop()
    const collapsedRows = projectSpoolSidebarRows({
      desktops: [desktop],
      expandedWorktreeRefsByDesktop: new Map(),
      activeRoute: null
    })
    const expandedRows = projectSpoolSidebarRows({
      desktops: [desktop],
      expandedWorktreeRefsByDesktop: new Map([['desktop-chen', new Set(['worktree-one'])]]),
      activeRoute: null
    })

    expect(collapsedRows.map((row) => row.type)).toEqual(['spool-worktree'])
    expect(expandedRows.map((row) => row.type)).toEqual(['spool-worktree', 'spool-session'])
  })
})
