import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/types'
import type { SpoolWorktreeSidebarRow } from './spool-sidebar-rows'
import { getRepoHeaderSectionEndByRepoId } from './worktree-header-section-boundaries'
import type { RenderRow } from './worktree-list-virtual-rows'
import type { WorkspaceSidebarProjectedRow } from './workspace-sidebar-row-projection'

function repo(id: string): Repo {
  return {
    id,
    path: `/tmp/${id}`,
    displayName: id,
    badgeColor: '#737373',
    addedAt: 1
  }
}

describe('workspace project header section boundaries', () => {
  it('includes inserted remote worktrees in the draggable Project extent', () => {
    const localRows: RenderRow[] = [
      {
        type: 'header',
        key: 'repo:repo-1',
        label: 'one',
        count: 1,
        tone: 'neutral',
        repo: repo('repo-1')
      },
      {
        type: 'header',
        key: 'repo:repo-2',
        label: 'two',
        count: 1,
        tone: 'neutral',
        repo: repo('repo-2')
      }
    ]
    const remoteWorktree: SpoolWorktreeSidebarRow = {
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
      branch: null,
      expanded: false,
      active: false,
      sessionCount: 0,
      sessionCatalogStatus: 'complete'
    }
    const rows: WorkspaceSidebarProjectedRow[] = [
      { kind: 'local', key: 'repo:repo-1', localIndex: 0, row: localRows[0]! },
      {
        kind: 'spool',
        key: remoteWorktree.key,
        row: remoteWorktree,
        localProjectHeaderKey: 'repo:repo-1'
      },
      { kind: 'local', key: 'repo:repo-2', localIndex: 1, row: localRows[1]! }
    ]

    const boundaries = getRepoHeaderSectionEndByRepoId({
      rows,
      localRows,
      firstLocalHeaderIndex: 0,
      sidebarRepoHeaderIdsByBucket: new Map([['bucket', ['repo-1', 'repo-2']]]),
      repoHeaderBucketByRepoId: new Map([
        ['repo-1', 'bucket'],
        ['repo-2', 'bucket']
      ])
    })

    expect(boundaries.get('repo-1')).toBe(60)
  })
})
