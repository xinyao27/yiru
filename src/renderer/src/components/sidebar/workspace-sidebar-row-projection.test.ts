import { describe, expect, it } from 'vitest'
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
  projectRef: 'project-orca',
  projectIdentityKey: 'github:paperboytm/orca',
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

  it('inserts a remote worktree into the matching local Project section', () => {
    const localProjectHeader: RenderRow = {
      type: 'header',
      key: 'project:github:paperboytm/orca',
      label: 'orca',
      count: 1,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:paperboytm/orca',
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
        key: 'project:github:paperboytm/orca',
        localIndex: 0,
        row: { ...localProjectHeader, count: 2 }
      },
      {
        kind: 'spool',
        key: 'spool-worktree-one',
        row: remoteWorktree,
        localProjectHeaderKey: 'project:github:paperboytm/orca'
      }
    ])
  })

  it('counts but hides a matched remote worktree when its local Project is collapsed', () => {
    const localProjectHeader: RenderRow = {
      type: 'header',
      key: 'project:github:paperboytm/orca',
      label: 'orca',
      count: 1,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:paperboytm/orca',
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
        key: 'project:github:paperboytm/orca',
        localIndex: 0,
        row: { ...localProjectHeader, count: 2 }
      }
    ])
  })

  it('does not match projects by display name', () => {
    const localProjectHeader: RenderRow = {
      type: 'header',
      key: 'project:local-orca',
      label: 'orca',
      count: 1,
      tone: 'neutral',
      projectId: 'local-orca',
      projectIdentityKey: 'git:git.example.com/local/orca',
      collapsed: false
    }
    const unrelatedRemote = {
      ...remoteWorktree,
      projectIdentityKey: 'git:git.example.com/other/orca'
    }

    const rows = projectWorkspaceSidebarRows({
      localRows: [localProjectHeader],
      spoolRows: [unrelatedRemote],
      spoolStatus: 'ready',
      spoolDiagnostic: null,
      getLocalRowKey: (row) => (row.type === 'header' ? row.key : 'local-row')
    })

    expect(rows[0]).toMatchObject({ kind: 'local', row: { count: 1 } })
    expect(rows[1]).toEqual({ kind: 'spool', key: unrelatedRemote.key, row: unrelatedRemote })
  })

  it('leaves a remote worktree ungrouped when the Project has ambiguous setup sections', () => {
    const localRows: RenderRow[] = ['one', 'two'].map((setup) => ({
      type: 'header',
      key: `project:github:paperboytm/orca::setup:${setup}`,
      label: `orca (${setup})`,
      count: 1,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:paperboytm/orca',
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
    expect(rows[2]).toEqual({ kind: 'spool', key: remoteWorktree.key, row: remoteWorktree })
  })

  it('does not duplicate a remote worktree across repeated host sections', () => {
    const repeatedHeader: RenderRow = {
      type: 'header',
      key: 'project:github:paperboytm/orca',
      label: 'orca',
      count: 1,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:paperboytm/orca',
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
      key: 'project:github:paperboytm/orca',
      label: 'orca',
      count: 0,
      tone: 'neutral',
      projectIdentityKey: 'github:paperboytm/orca',
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
      key: 'project:github:paperboytm/orca',
      label: 'orca',
      count: 0,
      tone: 'neutral',
      projectId: 'local-project-id',
      projectIdentityKey: 'github:paperboytm/orca',
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
