import type { AuthenticatedSpoolPrincipal } from '../../shared/rpc-principal'
import type {
  SpoolDesktopCatalog,
  SpoolSessionCatalogPage
} from '../../shared/spool/spool-catalog-contract'
import { SPOOL_PROTOCOL_VERSION } from '../../shared/spool/spool-wire-contract'
import {
  SpoolCatalogReferenceTable,
  type SpoolCatalogReferenceBinding
} from './spool-catalog-reference-table'
import {
  buildCatalogReferenceBindings,
  projectCatalogEntries,
  type ResolvedSpoolCatalogWorktree
} from './spool-catalog-projection-model'
import { SpoolCatalogDescriptionReader } from './spool-catalog-description-reader'
import { spoolCatalogFingerprint } from './spool-catalog-fingerprint'
import {
  readSpoolCatalogSessionPage,
  type SpoolCatalogSessionPageRequest
} from './spool-catalog-session-pages'
import type { SpoolQuotaProjection } from './spool-quota-projection'
import type {
  SpoolPublicWorktreeInstance,
  SpoolVisibilityChange,
  SpoolWorktreeVisibility
} from './spool-worktree-visibility'

const MAX_CATALOG_SNAPSHOT_ATTEMPTS = 4

export type SpoolCatalogSessionDescription = {
  sessionKey: string
  provider: 'claude' | 'codex' | 'other'
  title: string
}

export type SpoolCatalogWorktreeDescription = {
  projectKey: string
  projectName: string
  worktreeName: string
  branch: string | null
  sessions: readonly SpoolCatalogSessionDescription[]
}

export type SpoolShareCatalogSource = {
  describeWorktree(
    instance: SpoolPublicWorktreeInstance
  ): Promise<SpoolCatalogWorktreeDescription | null>
  subscribe?: (listener: () => void) => () => void
}

export type BoundSpoolWorktree = {
  worktreeId: string
  instanceId: string
  shareEpoch: string
  target: SpoolPublicWorktreeInstance['target']
}

export type BoundSpoolSession = BoundSpoolWorktree & {
  sessionKey: string
}

export class SpoolCatalogProjection {
  private readonly references = new SpoolCatalogReferenceTable()
  private readonly descriptions: SpoolCatalogDescriptionReader
  private revision = 0
  private generation = 0
  private fingerprint = ''
  private snapshotGeneration = -1
  private snapshotDescriptions: readonly ResolvedSpoolCatalogWorktree[] = []
  private transitionTail: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<() => void>()
  private closed = false

  constructor(
    readonly connectionId: string,
    private readonly ownerRuntimeId: string,
    private readonly visibility: SpoolWorktreeVisibility,
    source: SpoolShareCatalogSource,
    private readonly quota: SpoolQuotaProjection
  ) {
    this.descriptions = new SpoolCatalogDescriptionReader(visibility, source)
  }

  snapshot(): Promise<{ catalog: SpoolDesktopCatalog; generation: number }> {
    return this.serialize(async () => {
      for (let attempt = 0; attempt < MAX_CATALOG_SNAPSHOT_ATTEMPTS; attempt++) {
        this.requireOpen()
        const generation = this.generation
        const descriptions = await this.descriptions.read()
        if (generation !== this.generation) {
          continue
        }
        const quota = this.quota.snapshot()
        const nextFingerprint = spoolCatalogFingerprint(descriptions)
        if (nextFingerprint !== this.fingerprint) {
          this.fingerprint = nextFingerprint
          this.revision++
        }
        const bindings = buildCatalogReferenceBindings(descriptions, this.revision, generation)
        this.references.reconcile(bindings)
        const projects = projectCatalogEntries(
          descriptions,
          this.references,
          this.revision,
          generation
        )
        const catalog = {
          protocolVersion: SPOOL_PROTOCOL_VERSION,
          ownerRuntimeId: this.ownerRuntimeId,
          catalogRevision: this.revision,
          quota,
          projects
        }
        if (generation === this.generation) {
          this.snapshotGeneration = generation
          this.snapshotDescriptions = descriptions
          return { catalog, generation }
        }
      }
      throw new Error('spool_catalog_changed_during_snapshot')
    })
  }

  currentGeneration(): number {
    return this.generation
  }

  async resolveWorktree(worktreeRef: string): Promise<BoundSpoolWorktree | null> {
    const binding = this.references.resolve(worktreeRef)
    if (!binding || binding.kind !== 'worktree') {
      return null
    }
    return await this.resolveCurrentWorktree(binding)
  }

  async resolveSession(sessionRef: string): Promise<BoundSpoolSession | null> {
    const binding = this.references.resolve(sessionRef)
    if (!binding || binding.kind !== 'session') {
      return null
    }
    const worktree = await this.resolveCurrentWorktree(binding)
    return worktree ? { ...worktree, sessionKey: binding.sessionKey } : null
  }

  sessionPage(
    request: SpoolCatalogSessionPageRequest
  ): Promise<{ page: SpoolSessionCatalogPage; generation: number } | null> {
    return this.serialize(async () => {
      this.requireOpen()
      const generation = this.generation
      return readSpoolCatalogSessionPage({
        request,
        generation,
        catalogRevision: this.revision,
        snapshotGeneration: this.snapshotGeneration,
        snapshotDescriptions: this.snapshotDescriptions,
        references: this.references,
        visibility: this.visibility
      })
    })
  }

  invalidate(change: SpoolVisibilityChange): void {
    this.generation++
    this.references.invalidateInstance(change.instanceId)
    this.descriptions.invalidate(change.instanceId)
    this.fingerprint = ''
    this.emitChange()
  }

  sourceChanged(): void {
    this.generation++
    this.emitChange()
  }

  quotaChanged(): void {
    // Why: quota is desktop metadata, not session identity; refreshing it must
    // not invalidate a valid cursor chain that is still loading.
    this.emitChange()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.closed = true
    this.generation++
    this.references.clear()
    this.descriptions.clear()
    this.snapshotDescriptions = []
    this.snapshotGeneration = -1
    this.listeners.clear()
  }

  private async resolveCurrentWorktree(
    binding: Extract<
      SpoolCatalogReferenceBinding,
      { kind: 'worktree' | 'session' | 'session-page' }
    >
  ): Promise<BoundSpoolWorktree | null> {
    if (this.closed) {
      return null
    }
    const instance = await this.visibility.resolvePublicInstance(
      binding.instanceId,
      binding.shareEpoch
    )
    if (!instance || instance.worktreeId !== binding.worktreeId) {
      this.references.invalidateInstance(binding.instanceId)
      return null
    }
    return {
      worktreeId: binding.worktreeId,
      instanceId: binding.instanceId,
      shareEpoch: binding.shareEpoch,
      target: instance.target
    }
  }

  private requireOpen(): void {
    if (this.closed) {
      throw new Error('Spool catalog projection is closed')
    }
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Why: one requester observer must not interrupt catalog invalidation for later peers.
        console.error('[spool] Share catalog listener failed')
      }
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transitionTail.then(operation, operation)
    this.transitionTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

export class SpoolShareCatalog {
  private readonly projections = new Map<string, SpoolCatalogProjection>()
  private readonly unsubscribeVisibility: () => void
  private readonly unsubscribeSource: () => void
  private readonly unsubscribeQuota: () => void

  constructor(
    private readonly ownerRuntimeId: string,
    private readonly visibility: SpoolWorktreeVisibility,
    private readonly source: SpoolShareCatalogSource,
    private readonly quota: SpoolQuotaProjection
  ) {
    this.unsubscribeVisibility = visibility.subscribe((change) => {
      for (const projection of this.projections.values()) {
        projection.invalidate(change)
      }
    })
    const sourceChanged = (): void => {
      for (const projection of this.projections.values()) {
        projection.sourceChanged()
      }
    }
    this.unsubscribeSource = source.subscribe?.(sourceChanged) ?? (() => {})
    this.unsubscribeQuota = quota.subscribe(() => {
      for (const projection of this.projections.values()) {
        projection.quotaChanged()
      }
    })
  }

  openProjection(principal: AuthenticatedSpoolPrincipal): SpoolCatalogProjection {
    this.closeProjection(principal.connectionId)
    const projection = new SpoolCatalogProjection(
      principal.connectionId,
      this.ownerRuntimeId,
      this.visibility,
      this.source,
      this.quota
    )
    this.projections.set(principal.connectionId, projection)
    return projection
  }

  getProjection(connectionId: string): SpoolCatalogProjection | null {
    return this.projections.get(connectionId) ?? null
  }

  closeProjection(connectionId: string): void {
    this.projections.get(connectionId)?.close()
    this.projections.delete(connectionId)
  }

  close(): void {
    this.unsubscribeVisibility()
    this.unsubscribeSource()
    this.unsubscribeQuota()
    for (const projection of this.projections.values()) {
      projection.close()
    }
    this.projections.clear()
  }
}
