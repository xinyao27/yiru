import { ALL_EXECUTION_HOSTS_SCOPE, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { describe, expect, it } from 'vite-plus/test'

import type { Worktree } from '../../../../shared/types'
import { addHostSectionRows, type HostSectionOption } from './host-section-rows'
import { buildRows } from './worktree-list-groups'

const remoteHostId = 'ssh:remote'

const hosts: HostSectionOption[] = [
  {
    id: LOCAL_EXECUTION_HOST_ID,
    kind: 'local',
    label: LOCAL_EXECUTION_HOST_ID,
    detail: 'This computer',
    health: 'local'
  },
  {
    id: remoteHostId,
    kind: 'ssh',
    label: remoteHostId,
    detail: 'SSH',
    health: 'available'
  }
]

describe('pinned rows across execution hosts', () => {
  it('keeps host-localized headers with the owning workspace rows', () => {
    const pinnedRemote = {
      id: 'remote-pinned',
      repoId: 'repo',
      isPinned: true,
      hostId: remoteHostId
    } as unknown as Worktree
    const ordinaryLocal = {
      id: 'local',
      repoId: 'repo',
      isPinned: false
    } as unknown as Worktree
    const rows = buildRows({
      groupBy: 'none',
      worktrees: [pinnedRemote, ordinaryLocal],
      repoMap: new Map(),
      prCache: null,
      collapsedGroups: new Set()
    })

    const sectionRows = addHostSectionRows({
      rows,
      hostOptions: hosts,
      workspaceHostScope: ALL_EXECUTION_HOSTS_SCOPE,
      defaultHostId: LOCAL_EXECUTION_HOST_ID
    })

    expect(
      sectionRows
        .filter((row) => row.type === 'host-header')
        .map((row) => ({ hostId: row.hostId, count: row.count }))
    ).toEqual([
      { hostId: LOCAL_EXECUTION_HOST_ID, count: 1 },
      { hostId: remoteHostId, count: 1 }
    ])
    expect(
      sectionRows
        .filter((row) => row.type === 'item')
        .map((row) => ({ id: row.worktree.id, section: row.sectionKey }))
    ).toEqual([
      { id: 'local', section: 'all' },
      { id: 'remote-pinned', section: 'pinned' }
    ])
  })
})
