import { describe, expect, it, vi } from 'vitest'
import {
  buildCatalogReferenceBindings,
  projectCatalogEntries,
  sanitizeCatalogWorktreeDescription
} from './spool-catalog-projection-model'
import { SpoolCatalogReferenceTable } from './spool-catalog-reference-table'
import { SpoolCatalogSessionPages } from './spool-catalog-session-pages'
import type { SpoolShareCatalogSource } from './spool-share-catalog-source'
import type {
  SpoolPublicWorktreeInstance,
  SpoolWorktreeVisibility
} from './spool-worktree-visibility'

const instance: SpoolPublicWorktreeInstance = {
  worktreeId: 'worktree-one',
  instanceId: 'instance-one',
  projectId: 'project-one',
  shareEpoch: 'share-one',
  spoolIncarnationId: 'incarnation-one',
  actualHostScope: 'native',
  ownerWorktree: {
    kind: 'git',
    worktreeId: 'worktree-one',
    instanceId: 'instance-one',
    projectId: 'project-one',
    repoId: 'repo-one',
    executionHostId: 'local',
    worktreePath: '/repo/worktree-one'
  }
}

describe('Spool catalog session pages', () => {
  it('keeps a session whose owner title contains no wire-safe text', async () => {
    const description = sanitizeCatalogWorktreeDescription(instance, {
      kind: 'git',
      projectKey: 'project:project-one',
      projectIdentityKey: 'github:xinyao27/paperboy',
      projectName: 'paperboy',
      worktreeName: 'main-2',
      branch: 'refs/heads/main-2'
    })!
    const references = new SpoolCatalogReferenceTable()
    references.reconcile(buildCatalogReferenceBindings([description], 1, 0))
    const worktree = projectCatalogEntries([description], references, 1, 0)[0]?.worktrees[0]
    expect(worktree?.sessionCatalog.status).toBe('loading')
    if (!worktree || worktree.sessionCatalog.status !== 'loading') {
      throw new Error('Expected a loading worktree fixture')
    }
    const cursor = worktree.sessionCatalog.nextCursor
    if (!cursor) {
      throw new Error('Expected an opening session-page cursor')
    }
    const source: SpoolShareCatalogSource = {
      describeWorktree: async () => null,
      listSessionPage: async () => ({
        sessions: [
          {
            sessionKey: 'session-one',
            kind: 'agent',
            agent: 'codex',
            title: '\0\n'
          }
        ],
        nextCursor: null
      }),
      releaseSessionPage: vi.fn(),
      invalidateSessionPages: vi.fn()
    }
    const visibility = {
      isPublic: () => true,
      resolvePublicInstance: async () => instance
    } as unknown as SpoolWorktreeVisibility
    const pages = new SpoolCatalogSessionPages(source, visibility, references)

    await expect(
      pages.read(
        {
          worktreeRef: worktree.worktreeRef,
          shareEpoch: worktree.shareEpoch,
          catalogRevision: 1,
          cursor
        },
        {
          generation: 0,
          catalogRevision: 1,
          snapshotGeneration: 0,
          snapshotDescriptions: [description],
          isCurrent: () => true,
          reconcileReferences: () =>
            references.reconcile([
              ...buildCatalogReferenceBindings([description], 1, 0),
              ...pages.bindings()
            ])
        },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      page: {
        sessions: [{ kind: 'agent', agent: 'codex', title: 'codex' }],
        sessionCatalog: { status: 'complete', nextCursor: null }
      }
    })
  })
})
