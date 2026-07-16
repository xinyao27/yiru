import { describe, expect, it } from 'vitest'
import type { SpoolSidebarRow } from './spool-sidebar-rows'
import { projectWorkspaceSidebarRows } from './workspace-sidebar-row-projection'

const remoteWorktree: SpoolSidebarRow = {
  type: 'spool-worktree',
  kind: 'git',
  key: 'spool-worktree-one',
  desktopRef: 'desktop-chen',
  connectionEpoch: 1,
  projectRef: 'project-orca',
  worktreeRef: 'worktree-one',
  shareEpoch: 'share-one',
  desktop: {
    userDisplayName: 'chen',
    nodeDisplayName: 'chen-macbook',
    connectionStatus: 'connected',
    quota: []
  },
  name: 'worktree-one',
  branch: 'feature/one',
  expanded: false,
  active: false,
  sessionCount: 0,
  sessionCatalogStatus: 'complete'
}

describe('projectWorkspaceSidebarRows', () => {
  it('places Spool worktrees directly in the Projects list without a Spool section row', () => {
    const rows = projectWorkspaceSidebarRows({
      localRows: [],
      spoolRows: [remoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: () => 'unused'
    })

    expect(rows).toEqual([
      {
        kind: 'spool',
        key: 'spool-worktree-one',
        row: remoteWorktree
      }
    ])
  })
})
