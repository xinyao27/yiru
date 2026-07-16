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
  buildReservedCatalogSessionBinding,
  projectCatalogEntries,
  type ResolvedSpoolCatalogWorktree
} from './spool-catalog-projection-model'
import { SpoolCatalogDescriptionReader } from './spool-catalog-description-reader'
import { spoolCatalogFingerprint } from './spool-catalog-fingerprint'
import {
  SpoolCatalogSessionPages,
  type SpoolCatalogSessionPageRequest
} from './spool-catalog-session-pages'
import type { SpoolQuotaProjection } from './spool-quota-projection'
import type { SpoolShareCatalogSource } from './spool-share-catalog-source'
import type {
  SpoolPublicWorktreeInstance,
  SpoolVisibilityChange,
  SpoolWorktreeVisibility
} from './spool-worktree-visibility'

const MAX_CATALOG_SNAPSHOT_ATTEMPTS = 4

export type BoundSpoolWorktree = SpoolPublicWorktreeInstance

export type BoundSpoolSession = {
  worktree: BoundSpoolWorktree
  sessionKey: string
}

export class SpoolCatalogProjection {
  private readonly references = new SpoolCatalogReferenceTable()
  private readonly descriptions: SpoolCatalogDescriptionReader
  private readonly sessionPages: SpoolCatalogSessionPages
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
    private readonly source: SpoolShareCatalogSource,
    private readonly quota: SpoolQuotaProjection
  ) {
    this.descriptions = new SpoolCatalogDescriptionReader(visibility, source)
    this.sessionPages = new SpoolCatalogSessionPages(source, visibility, this.references)
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
        this.snapshotGeneration = generation
        this.snapshotDescriptions = descriptions
        this.reconcileReferences()
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
    const binding = this.resolveCurrentSessionBinding(sessionRef)
    if (!binding) {
      return null
    }
    const worktree = await this.resolveCurrentWorktree(binding)
    if (
      !worktree ||
      this.closed ||
      binding.catalogRevision !== this.revision ||
      binding.generation !== this.generation
    ) {
      return null
    }
    return { worktree, sessionKey: binding.sessionKey }
  }

  resolvePublishedSession(sessionRef: string): BoundSpoolSession | null {
    const binding = this.resolveCurrentSessionBinding(sessionRef)
    if (!binding) {
      return null
    }
    const worktree = this.visibility.getPublishedInstance(binding.instanceId, binding.shareEpoch)
    if (!worktree || worktree.worktreeId !== binding.worktreeId) {
      this.references.invalidateInstance(binding.instanceId)
      return null
    }
    // Why: terminal mutations still run the actual-host incarnation guard at
    // the PTY commit point; binding only needs the current connection alias.
    return { worktree, sessionKey: binding.sessionKey }
  }

  retainSessionReference(sessionRef: string): boolean {
    return !this.closed && this.references.pinSession(sessionRef)
  }

  reserveSessionReference(
    worktree: BoundSpoolWorktree,
    sessionKey: string
  ): Promise<string | null> {
    return this.serialize(async () => {
      if (this.closed) {
        return null
      }
      const published = this.visibility.getPublishedInstance(
        worktree.instanceId,
        worktree.shareEpoch
      )
      if (!published || published.worktreeId !== worktree.worktreeId) {
        return null
      }
      // Why: creation must return a usable alias before the asynchronous session
      // catalog observes the newly published owner terminal.
      return this.references.reserveSession(
        buildReservedCatalogSessionBinding(worktree, sessionKey, this.revision, this.generation)
      )
    })
  }

  async sessionPage(
    request: SpoolCatalogSessionPageRequest,
    signal: AbortSignal
  ): Promise<{ page: SpoolSessionCatalogPage; generation: number } | null> {
    return await this.serialize(async () => {
      this.requireOpen()
      const generation = this.generation
      return await this.sessionPages.read(
        request,
        {
          generation,
          catalogRevision: this.revision,
          snapshotGeneration: this.snapshotGeneration,
          snapshotDescriptions: this.snapshotDescriptions,
          isCurrent: () => !this.closed && generation === this.generation,
          reconcileReferences: () => this.reconcileReferences()
        },
        signal
      )
    })
  }

  invalidate(change: SpoolVisibilityChange): void {
    this.generation++
    this.sessionPages.clear()
    this.source.invalidateSessionPages(change.instanceId)
    this.references.invalidateInstance(change.instanceId)
    this.descriptions.invalidate(change.instanceId)
    this.fingerprint = ''
    this.emitChange()
  }

  sourceChanged(): void {
    this.generation++
    this.sessionPages.clear()
    this.fingerprint = ''
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
    this.sessionPages.clear()
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
    return instance
  }

  private resolveCurrentSessionBinding(
    sessionRef: string
  ): Extract<SpoolCatalogReferenceBinding, { kind: 'session' }> | null {
    const binding = this.references.resolve(sessionRef)
    return !this.closed &&
      binding?.kind === 'session' &&
      binding.catalogRevision === this.revision &&
      binding.generation === this.generation
      ? binding
      : null
  }

  private reconcileReferences(): void {
    this.references.reconcile([
      ...buildCatalogReferenceBindings(
        this.snapshotDescriptions,
        this.revision,
        this.snapshotGeneration
      ),
      ...this.sessionPages.bindings()
    ])
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
