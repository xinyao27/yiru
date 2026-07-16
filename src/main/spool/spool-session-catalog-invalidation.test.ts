import { describe, expect, it } from 'vitest'
import type { SpoolMobileSessionTabsResult } from './spool-session-source'
import type {
  SpoolExecutionHostSessionReader,
  SpoolExecutionHostSessionReadRequest,
  SpoolHistoricalSessionConsistency
} from './spool-session-source'
import { SpoolMobileVaultSessionSource } from './spool-mobile-vault-session-source'
import { OrcaSpoolExecutionHostSessionReader } from './spool-orca-session-reader'
import { SpoolOwnerSessionRecords } from './spool-owner-session-records'
import type { SpoolExecutionError } from './spool-execution-error'
import { SpoolSessionCatalog } from './spool-session-catalog'
import type { SpoolSessionProvenanceIndex } from './spool-session-provenance-index'
import { toSessionWorktree } from './spool-session-worktree-binding'
import { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

function emptySessionSnapshot(worktreeId: string): SpoolMobileSessionTabsResult {
  return {
    worktree: worktreeId,
    publicationEpoch: 'publication-one',
    snapshotVersion: 1,
    activeGroupId: null,
    activeTabId: null,
    activeTabType: null,
    tabs: []
  }
}

function sessionSnapshotWithTerminal(worktreeId: string): SpoolMobileSessionTabsResult {
  return {
    ...emptySessionSnapshot(worktreeId),
    snapshotVersion: 2,
    activeTabId: 'tab-one',
    activeTabType: 'terminal',
    tabs: [
      {
        type: 'terminal',
        id: 'tab-one',
        title: 'Terminal',
        parentTabId: 'tab-one',
        leafId: 'leaf-one',
        isActive: true,
        status: 'ready',
        terminal: 'terminal-one',
        worktreeInstanceId: publicWorktree.instanceId
      }
    ]
  }
}

const publicWorktree: SpoolPublicWorktreeInstance = {
  worktreeId: 'worktree-main-2',
  instanceId: 'instance-main-2',
  projectId: 'github:paperboytm/paperboy',
  shareEpoch: 'share-main-2',
  spoolIncarnationId: 'incarnation-main-2',
  actualHostScope: 'local-owner',
  ownerWorktree: {
    kind: 'git',
    worktreeId: 'worktree-main-2',
    instanceId: 'instance-main-2',
    projectId: 'github:paperboytm/paperboy',
    repoId: 'repo-paperboy',
    executionHostId: 'local',
    worktreePath: '/owner/paperboy/main-2'
  }
}

const publicReadRequest: SpoolExecutionHostSessionReadRequest = {
  worktreeKind: 'git',
  executionHostId: 'local',
  worktreeId: publicWorktree.worktreeId,
  worktreeInstanceId: publicWorktree.instanceId,
  spoolIncarnationId: publicWorktree.spoolIncarnationId,
  worktreePath: publicWorktree.ownerWorktree.worktreePath,
  localWslDistro: null,
  purpose: 'catalog',
  inventoryScope: '00000000-0000-4000-8000-000000000000'
}

describe('Spool session catalog invalidation', () => {
  it('finishes a public worktree page while an unrelated session snapshot changes', async () => {
    let emitSessionChange: Parameters<NonNullable<SpoolExecutionHostSessionReader['subscribe']>>[0]
    const reader: SpoolExecutionHostSessionReader = {
      registerPublicWorktree: () => undefined,
      unregisterPublicWorktree: () => undefined,
      listMobileSessionTabs: async (request) => emptySessionSnapshot(request.worktreeId),
      listAiVaultSessionPage: async () => {
        emitSessionChange(emptySessionSnapshot('unrelated-worktree'), undefined)
        return { sessions: [], nextCursor: null, scannedAt: 'inventory-one' }
      },
      releaseAiVaultSessionPage: async () => undefined,
      subscribe: (listener) => {
        emitSessionChange = listener
        return () => undefined
      }
    }
    const provenance = {
      resolve: () => null,
      attest: () => false
    } as unknown as SpoolSessionProvenanceIndex
    const source = new SpoolMobileVaultSessionSource(
      reader,
      new SpoolOwnerSessionRecords(),
      new SpoolTerminalSessionBindings(),
      provenance
    )
    const consistency: SpoolHistoricalSessionConsistency = {
      open: async () => ({ retainConsistent: async (candidates) => candidates })
    }
    const catalog = new SpoolSessionCatalog(provenance, source, consistency)
    source.trackPublicWorktree(publicWorktree)

    await expect(
      catalog.listSessionPage(
        publicWorktree,
        null,
        '00000000-0000-4000-8000-000000000001',
        new AbortController().signal
      )
    ).resolves.toEqual({ sessions: [], nextCursor: null })

    catalog.close()
  })

  it('finishes a page while the same Public session snapshot repeats', async () => {
    let emitSessionChange: Parameters<NonNullable<SpoolExecutionHostSessionReader['subscribe']>>[0]
    const reader: SpoolExecutionHostSessionReader = {
      registerPublicWorktree: () => undefined,
      unregisterPublicWorktree: () => undefined,
      listMobileSessionTabs: async () => emptySessionSnapshot(publicWorktree.worktreeId),
      listAiVaultSessionPage: async () => {
        emitSessionChange(
          { ...emptySessionSnapshot(publicWorktree.worktreeId), snapshotVersion: 2 },
          publicReadRequest
        )
        return { sessions: [], nextCursor: null, scannedAt: 'inventory-one' }
      },
      releaseAiVaultSessionPage: async () => undefined,
      subscribe: (listener) => {
        emitSessionChange = listener
        return () => undefined
      }
    }
    const provenance = {
      resolve: () => null,
      attest: () => false
    } as unknown as SpoolSessionProvenanceIndex
    const source = new SpoolMobileVaultSessionSource(
      reader,
      new SpoolOwnerSessionRecords(),
      new SpoolTerminalSessionBindings(),
      provenance
    )
    const consistency: SpoolHistoricalSessionConsistency = {
      open: async () => ({ retainConsistent: async (candidates) => candidates })
    }
    const catalog = new SpoolSessionCatalog(provenance, source, consistency)
    source.trackPublicWorktree(publicWorktree)
    await source.listLiveSessions(toSessionWorktree(publicWorktree))

    await expect(
      catalog.listSessionPage(
        publicWorktree,
        null,
        '00000000-0000-4000-8000-000000000001',
        new AbortController().signal
      )
    ).resolves.toEqual({ sessions: [], nextCursor: null })

    catalog.close()
  })

  it('routes an empty snapshot through its unique registered Public worktree', () => {
    let emitSessionChange: (snapshot: SpoolMobileSessionTabsResult) => void = () => undefined
    const reader = new OrcaSpoolExecutionHostSessionReader({
      listMobileSessionTabs: async () => emptySessionSnapshot(publicWorktree.worktreeId),
      onMobileSessionTabsChanged: (listener) => {
        emitSessionChange = listener
        return () => undefined
      }
    })
    reader.registerPublicWorktree(publicReadRequest)
    let observedRequest: SpoolExecutionHostSessionReadRequest | undefined
    const unsubscribe = reader.subscribe((_snapshot, request) => {
      observedRequest = request
    })

    emitSessionChange(emptySessionSnapshot(publicWorktree.worktreeId))

    expect(observedRequest).toEqual(publicReadRequest)
    unsubscribe()
  })

  it('invalidates when a Public snapshot changes its projected sessions', async () => {
    let emitSessionChange: Parameters<
      NonNullable<SpoolExecutionHostSessionReader['subscribe']>
    >[0] = () => undefined
    const reader: SpoolExecutionHostSessionReader = {
      registerPublicWorktree: () => undefined,
      unregisterPublicWorktree: () => undefined,
      listMobileSessionTabs: async () => emptySessionSnapshot(publicWorktree.worktreeId),
      listAiVaultSessionPage: async () => ({
        sessions: [],
        nextCursor: null,
        scannedAt: 'inventory-one'
      }),
      releaseAiVaultSessionPage: async () => undefined,
      subscribe: (listener) => {
        emitSessionChange = listener
        return () => undefined
      }
    }
    const provenance = {
      resolve: () => null,
      attest: () => false
    } as unknown as SpoolSessionProvenanceIndex
    const source = new SpoolMobileVaultSessionSource(
      reader,
      new SpoolOwnerSessionRecords(),
      new SpoolTerminalSessionBindings(),
      provenance
    )
    source.trackPublicWorktree(publicWorktree)
    await source.listLiveSessions(toSessionWorktree(publicWorktree))
    let changes = 0
    const unsubscribe = source.subscribe(() => changes++)

    emitSessionChange(sessionSnapshotWithTerminal(publicWorktree.worktreeId), publicReadRequest)

    expect(changes).toBe(1)
    unsubscribe()
  })

  it('ignores a repeated explicit provider-session observation', () => {
    let emitSessionChange: Parameters<
      NonNullable<SpoolExecutionHostSessionReader['subscribe']>
    >[0] = () => undefined
    const reader: SpoolExecutionHostSessionReader = {
      registerPublicWorktree: () => undefined,
      unregisterPublicWorktree: () => undefined,
      listMobileSessionTabs: async () => emptySessionSnapshot(publicWorktree.worktreeId),
      listAiVaultSessionPage: async () => ({
        sessions: [],
        nextCursor: null,
        scannedAt: 'inventory-one'
      }),
      releaseAiVaultSessionPage: async () => undefined,
      subscribe: (listener) => {
        emitSessionChange = listener
        return () => undefined
      }
    }
    const provenance = {
      resolve: () => null,
      attest: () => false
    } as unknown as SpoolSessionProvenanceIndex
    const source = new SpoolMobileVaultSessionSource(
      reader,
      new SpoolOwnerSessionRecords(),
      new SpoolTerminalSessionBindings(),
      provenance
    )
    source.trackPublicWorktree(publicWorktree)
    let changes = 0
    const unsubscribe = source.subscribe(() => changes++)
    const observation = [
      {
        provider: 'codex' as const,
        providerSessionId: 'provider-session-one',
        sessionKey: 'session-one'
      }
    ]

    emitSessionChange(undefined, publicReadRequest, observation)
    emitSessionChange(undefined, publicReadRequest, observation)

    expect(changes).toBe(1)
    unsubscribe()
  })

  it('ignores terminal bindings outside Public worktrees', () => {
    const sessionBindings = new SpoolTerminalSessionBindings()
    const reader: SpoolExecutionHostSessionReader = {
      registerPublicWorktree: () => undefined,
      unregisterPublicWorktree: () => undefined,
      listMobileSessionTabs: async () => emptySessionSnapshot(publicWorktree.worktreeId),
      listAiVaultSessionPage: async () => ({
        sessions: [],
        nextCursor: null,
        scannedAt: 'inventory-one'
      }),
      releaseAiVaultSessionPage: async () => undefined
    }
    const provenance = {
      resolve: () => null,
      attest: () => false
    } as unknown as SpoolSessionProvenanceIndex
    const source = new SpoolMobileVaultSessionSource(
      reader,
      new SpoolOwnerSessionRecords(),
      sessionBindings,
      provenance
    )
    source.trackPublicWorktree(publicWorktree)
    let changes = 0
    const unsubscribe = source.subscribe(() => changes++)

    sessionBindings.rememberSpawned(
      {
        ...publicWorktree,
        worktreeId: 'private-worktree',
        instanceId: 'private-instance',
        spoolIncarnationId: 'private-incarnation'
      },
      'private-terminal',
      {
        provider: 'codex',
        sessionKind: 'agent',
        agent: 'codex',
        title: 'Private session'
      }
    )

    expect(changes).toBe(0)
    unsubscribe()
  })

  it('does not emit twice for the same terminal binding', () => {
    const sessionBindings = new SpoolTerminalSessionBindings()
    let changes = 0
    const unsubscribe = sessionBindings.subscribe(() => changes++)
    const session = {
      provider: 'codex' as const,
      sessionKind: 'agent' as const,
      agent: 'codex' as const,
      title: 'Public session'
    }

    sessionBindings.rememberSpawned(publicWorktree, 'public-terminal', session)
    sessionBindings.rememberSpawned(publicWorktree, 'public-terminal', session)

    expect(changes).toBe(1)
    unsubscribe()
  })

  it('tags an unexpected historical consistency failure without exposing its message', async () => {
    const reader: SpoolExecutionHostSessionReader = {
      registerPublicWorktree: () => undefined,
      unregisterPublicWorktree: () => undefined,
      listMobileSessionTabs: async () => emptySessionSnapshot(publicWorktree.worktreeId),
      listAiVaultSessionPage: async () => ({
        sessions: [],
        nextCursor: null,
        scannedAt: 'inventory-one'
      }),
      releaseAiVaultSessionPage: async () => undefined
    }
    const provenance = {
      resolve: () => null,
      attest: () => false
    } as unknown as SpoolSessionProvenanceIndex
    const source = new SpoolMobileVaultSessionSource(
      reader,
      new SpoolOwnerSessionRecords(),
      new SpoolTerminalSessionBindings(),
      provenance
    )
    const consistency: SpoolHistoricalSessionConsistency = {
      open: async () => {
        throw new Error('owner-only path and identity details')
      }
    }
    const catalog = new SpoolSessionCatalog(provenance, source, consistency)
    source.trackPublicWorktree(publicWorktree)

    await expect(
      catalog.listSessionPage(
        publicWorktree,
        null,
        '00000000-0000-4000-8000-000000000001',
        new AbortController().signal
      )
    ).rejects.toMatchObject({
      code: 'internal_error',
      diagnostic: 'session-consistency',
      message: 'spool_execution_internal_error'
    } satisfies Partial<SpoolExecutionError>)

    catalog.close()
  })
})
