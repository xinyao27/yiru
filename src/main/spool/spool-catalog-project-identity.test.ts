import { describe, expect, it } from 'vitest'
import { SPOOL_PROTOCOL_VERSION } from '../../shared/spool/spool-wire-contract'
import { isSpoolDesktopCatalog } from './spool-catalog-wire-validation'
import {
  buildCatalogReferenceBindings,
  projectCatalogEntries,
  sanitizeCatalogWorktreeDescription
} from './spool-catalog-projection-model'
import { SpoolCatalogReferenceTable } from './spool-catalog-reference-table'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

const instance: SpoolPublicWorktreeInstance = {
  worktreeId: 'worktree-1',
  instanceId: 'instance-1',
  projectId: 'local-project-id',
  shareEpoch: 'share-1',
  spoolIncarnationId: 'incarnation-1',
  actualHostScope: 'native',
  ownerWorktree: {
    kind: 'git',
    worktreeId: 'worktree-1',
    instanceId: 'instance-1',
    projectId: 'local-project-id',
    repoId: 'repo-1',
    executionHostId: 'local',
    worktreePath: '/repo/worktree-1'
  }
}

describe('Spool catalog Project identity', () => {
  it('preserves a portable identity through projection and wire validation', () => {
    const resolved = sanitizeCatalogWorktreeDescription(instance, {
      kind: 'git',
      projectKey: 'project:local-project-id',
      projectIdentityKey: 'github:paperboytm/yiru',
      projectName: 'yiru',
      worktreeName: 'worktree-one',
      branch: 'feature/one'
    })
    expect(resolved).not.toBeNull()

    const references = new SpoolCatalogReferenceTable()
    references.reconcile(buildCatalogReferenceBindings([resolved!], 1, 0))
    const projects = projectCatalogEntries([resolved!], references, 1, 0)
    expect(projects[0]?.projectRef).toBe('github:paperboytm/yiru')

    expect(
      isSpoolDesktopCatalog(
        {
          protocolVersion: SPOOL_PROTOCOL_VERSION,
          ownerRuntimeId: 'owner-runtime',
          catalogRevision: 1,
          quota: [],
          projects
        },
        'owner-runtime'
      )
    ).toBe(true)
  })

  it('keeps accepting legacy opaque Project refs', () => {
    expect(
      isSpoolDesktopCatalog(
        {
          protocolVersion: SPOOL_PROTOCOL_VERSION,
          ownerRuntimeId: 'owner-runtime',
          catalogRevision: 1,
          quota: [],
          projects: [{ projectRef: 'project-ref', name: 'yiru', worktrees: [] }]
        },
        'owner-runtime'
      )
    ).toBe(true)
  })

  it('rejects host-local IDs as portable identity keys', () => {
    expect(
      sanitizeCatalogWorktreeDescription(instance, {
        kind: 'git',
        projectKey: 'project:local-project-id',
        projectIdentityKey: 'project:local-project-id',
        projectName: 'yiru',
        worktreeName: 'worktree-one',
        branch: null
      })
    ).toBeNull()
  })
})
