import { describe, expect, it } from 'vite-plus/test'
import type { SpoolSidebarRow } from './spool-sidebar-rows'
import type { RenderRow } from './worktree-list-virtual-rows'
import {
  extractWorkspaceSidebarVirtualRowIndexes,
  projectWorkspaceSidebarRows,
  workspaceIndexForLocalRowIndex,
  workspaceSidebarStickyRangeStart
} from './workspace-sidebar-row-projection'

const remoteWorktree: SpoolSidebarRow = {
  type: 'spool-worktree',
  kind: 'git',
  key: 'spool-worktree-one',
  desktopRef: 'desktop-chen',
  connectionEpoch: 1,
  projectRef: 'project-yiru',
  projectIdentityKey: 'github:xinyao27/yiru',
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
  it('places unmatched remote worktrees in a fallback group without a Spool section row', () => {
    const rows = projectWorkspaceSidebarRows({
      localRows: [],
      spoolRows: [remoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: () => 'unused'
    })

    expect(rows).toEqual([
      {
        kind: 'spool-remote-worktrees-header',
        key: 'spool:remote-worktrees-header',
        worktreeCount: 1,
        collapsed: false
      },
      {
        kind: 'spool',
        key: 'spool-worktree-one',
        row: remoteWorktree
      }
    ])
  })

  it('groups a remote worktree that has no matching Project identity', () => {
    const unscopedRemoteWorktree = {
      ...remoteWorktree,
      projectRef: 'unscoped-project',
      projectIdentityKey: null
    }
    const rows = projectWorkspaceSidebarRows({
      localRows: [],
      spoolRows: [unscopedRemoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: () => 'unused'
    })

    expect(rows).toEqual([
      {
        kind: 'spool-remote-worktrees-header',
        key: 'spool:remote-worktrees-header',
        worktreeCount: 1,
        collapsed: false
      },
      {
        kind: 'spool',
        key: unscopedRemoteWorktree.key,
        row: unscopedRemoteWorktree
      }
    ])
  })

  it('keeps the Remote header and hides unmatched rows when collapsed', () => {
    const unscopedRemoteWorktree = {
      ...remoteWorktree,
      projectRef: 'unscoped-project',
      projectIdentityKey: null
    }
    const rows = projectWorkspaceSidebarRows({
      localRows: [],
      spoolRows: [unscopedRemoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      remoteWorktreesCollapsed: true,
      getLocalRowKey: () => 'unused'
    })

    expect(rows).toEqual([
      {
        kind: 'spool-remote-worktrees-header',
        key: 'spool:remote-worktrees-header',
        worktreeCount: 1,
        collapsed: true
      }
    ])
  })

  it('keeps standalone connection feedback visible while Remote is collapsed', () => {
    const desktopStatus: SpoolSidebarRow = {
      type: 'spool-desktop-status',
      key: 'spool-desktop-status-one',
      desktopRef: 'desktop-chen',
      desktop: remoteWorktree.desktop
    }
    const rows = projectWorkspaceSidebarRows({
      localRows: [],
      spoolRows: [desktopStatus],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      remoteWorktreesCollapsed: true,
      getLocalRowKey: () => 'unused'
    })

    expect(rows).toEqual([{ kind: 'spool', key: desktopStatus.key, row: desktopStatus }])
  })

  it('inserts a remote worktree into the matching local Project section', () => {
    const localProjectHeader: RenderRow = {
      type: 'header',
      key: 'project:github:xinyao27/yiru',
      label: 'yiru',
      count: 1,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:xinyao27/yiru',
      collapsed: false
    }

    const rows = projectWorkspaceSidebarRows({
      localRows: [localProjectHeader],
      spoolRows: [remoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: (row) => (row.type === 'header' ? row.key : 'local-row')
    })

    expect(rows).toEqual([
      {
        kind: 'local',
        key: 'project:github:xinyao27/yiru',
        localIndex: 0,
        row: { ...localProjectHeader, count: 2 }
      },
      {
        kind: 'spool',
        key: 'spool-worktree-one',
        row: remoteWorktree,
        localProjectHeaderKey: 'project:github:xinyao27/yiru'
      }
    ])
  })

  it('counts but hides a matched remote worktree when its local Project is collapsed', () => {
    const localProjectHeader: RenderRow = {
      type: 'header',
      key: 'project:github:xinyao27/yiru',
      label: 'yiru',
      count: 1,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:xinyao27/yiru',
      collapsed: true
    }

    const rows = projectWorkspaceSidebarRows({
      localRows: [localProjectHeader],
      spoolRows: [remoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: (row) => (row.type === 'header' ? row.key : 'local-row')
    })

    expect(rows).toEqual([
      {
        kind: 'local',
        key: 'project:github:xinyao27/yiru',
        localIndex: 0,
        row: { ...localProjectHeader, count: 2 }
      }
    ])
  })

  it('does not match projects by display name', () => {
    const localProjectHeader: RenderRow = {
      type: 'header',
      key: 'project:local-yiru',
      label: 'yiru',
      count: 1,
      tone: 'neutral',
      projectId: 'local-yiru',
      projectIdentityKey: 'git:git.example.com/local/yiru',
      collapsed: false
    }
    const unrelatedRemote = {
      ...remoteWorktree,
      projectIdentityKey: 'git:git.example.com/other/yiru'
    }

    const rows = projectWorkspaceSidebarRows({
      localRows: [localProjectHeader],
      spoolRows: [unrelatedRemote],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: (row) => (row.type === 'header' ? row.key : 'local-row')
    })

    expect(rows[0]).toMatchObject({ kind: 'local', row: { count: 1 } })
    expect(rows[1]).toEqual({
      kind: 'spool-remote-worktrees-header',
      key: 'spool:remote-worktrees-header',
      worktreeCount: 1,
      collapsed: false
    })
    expect(rows[2]).toEqual({ kind: 'spool', key: unrelatedRemote.key, row: unrelatedRemote })
  })

  it('uses the fallback remote group when the Project has ambiguous setup sections', () => {
    const localRows: RenderRow[] = ['one', 'two'].map((setup) => ({
      type: 'header',
      key: `project:github:xinyao27/yiru::setup:${setup}`,
      label: `yiru (${setup})`,
      count: 1,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:xinyao27/yiru',
      collapsed: false
    }))

    const rows = projectWorkspaceSidebarRows({
      localRows,
      spoolRows: [remoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: (row) => (row.type === 'header' ? row.key : 'local-row')
    })

    expect(rows.slice(0, 2)).toMatchObject([
      { kind: 'local', row: { count: 1 } },
      { kind: 'local', row: { count: 1 } }
    ])
    expect(rows[2]).toEqual({
      kind: 'spool-remote-worktrees-header',
      key: 'spool:remote-worktrees-header',
      worktreeCount: 1,
      collapsed: false
    })
    expect(rows[3]).toEqual({ kind: 'spool', key: remoteWorktree.key, row: remoteWorktree })
  })

  it('does not duplicate a remote worktree across repeated host sections', () => {
    const repeatedHeader: RenderRow = {
      type: 'header',
      key: 'project:github:xinyao27/yiru',
      label: 'yiru',
      count: 1,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:xinyao27/yiru',
      collapsed: false
    }

    const rows = projectWorkspaceSidebarRows({
      localRows: [repeatedHeader, repeatedHeader],
      spoolRows: [remoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: (row) => (row.type === 'header' ? row.key : 'local-row')
    })

    expect(rows.filter((row) => row.kind === 'spool')).toHaveLength(1)
    expect(rows.slice(0, 2)).toMatchObject([
      { kind: 'local', row: { count: 1 } },
      { kind: 'local', row: { count: 1 } }
    ])
  })

  it('maps a local row index through inserted remote rows', () => {
    const firstHeader: RenderRow = {
      type: 'header',
      key: 'project:github:xinyao27/yiru',
      label: 'yiru',
      count: 0,
      tone: 'neutral',
      projectIdentityKey: 'github:xinyao27/yiru',
      collapsed: false
    }
    const secondHeader: RenderRow = {
      type: 'header',
      key: 'project:github:example/other',
      label: 'other',
      count: 0,
      tone: 'neutral',
      projectIdentityKey: 'github:example/other',
      collapsed: false
    }
    const rows = projectWorkspaceSidebarRows({
      localRows: [firstHeader, secondHeader],
      spoolRows: [remoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: (row) => (row.type === 'header' ? row.key : 'local-row')
    })

    expect(workspaceIndexForLocalRowIndex(rows, 1)).toBe(2)
  })

  it('keeps a matched Project header sticky across its inserted remote rows', () => {
    const localProjectHeader: RenderRow = {
      type: 'header',
      key: 'project:github:xinyao27/yiru',
      label: 'yiru',
      count: 0,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:xinyao27/yiru',
      collapsed: false
    }
    const rows = projectWorkspaceSidebarRows({
      localRows: [localProjectHeader],
      spoolRows: [remoteWorktree],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: (row) => (row.type === 'header' ? row.key : 'local-row')
    })
    const stickyRows = rows.map((row) => (row.kind === 'local' ? row.row : { type: row.kind }))

    expect(workspaceSidebarStickyRangeStart(1, rows)).toBe(1)
    expect(
      extractWorkspaceSidebarVirtualRowIndexes({
        range: { startIndex: 1, endIndex: 1, overscan: 0, count: rows.length },
        rows,
        stickyRows,
        stickyHeaderIndexes: [0]
      })
    ).toEqual([0, 1])
  })
})
