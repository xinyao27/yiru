import type { CoworkingPublicWorktreeInstance } from '../worktree-visibility'
import { matchesHistoricalSession, CoworkingSessionInventoryCache } from './inventory-cache'
import { CoworkingSessionPageChains, type CoworkingSessionCatalogPageResult } from './page-chains'
import { CoworkingSessionPageProjector } from './page-projector'
import type {
  CoworkingProvenanceProvider,
  CoworkingSessionProvenanceIndex
} from './provenance-index'
import type { CoworkingResolvedHistoricalSession, CoworkingResolvedSession } from './resolution'
import type {
  CoworkingHistoricalSessionConsistency,
  CoworkingOwnerHistoricalSessionRecord,
  CoworkingSessionSource,
  CoworkingSessionWorktreeIdentity
} from './source'
import { requireExactWorktreeIdentity, toSessionWorktree } from './worktree-binding'

export type { CoworkingSessionCatalogPageResult } from './page-chains'
export type {
  CoworkingResolvedHistoricalSession,
  CoworkingResolvedLiveSession,
  CoworkingResolvedSession,
  CoworkingSessionCatalogDescription
} from './resolution'

export class CoworkingSessionCatalog {
  private readonly listeners = new Set<() => void>()
  private readonly inventories = new CoworkingSessionInventoryCache()
  private readonly pages: CoworkingSessionPageChains
  private readonly unsubscribeSource: () => void

  constructor(
    private readonly provenance: CoworkingSessionProvenanceIndex,
    private readonly source: CoworkingSessionSource,
    historicalConsistency: CoworkingHistoricalSessionConsistency,
    private readonly onListenerError: (error: unknown) => void = defaultListenerError
  ) {
    this.pages = new CoworkingSessionPageChains(
      new CoworkingSessionPageProjector(
        provenance,
        source,
        historicalConsistency,
        this.inventories,
        () => this.provenanceChanged()
      )
    )
    this.unsubscribeSource =
      source.subscribe?.(() => {
        this.clearSessionState()
        this.emitChange()
      }) ?? (() => {})
  }

  async listSessionPage(
    instance: CoworkingPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string,
    signal: AbortSignal
  ): Promise<CoworkingSessionCatalogPageResult> {
    return await this.pages.listPage(instance, cursor, inventoryScope, signal)
  }

  releaseSessionPage(
    instance: CoworkingPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string
  ): void {
    this.pages.release(instance, cursor, inventoryScope)
  }

  resolveSession(
    instance: CoworkingPublicWorktreeInstance,
    sessionKey: string
  ): CoworkingResolvedSession | null {
    const worktree = toSessionWorktree(instance)
    requireExactWorktreeIdentity(worktree)
    // Why: a wire session reference only exists after its page populated this owner-only cache.
    return this.inventories.resolveSession(worktree, sessionKey)
  }

  resolveHistoricalRecord(
    session: CoworkingResolvedHistoricalSession
  ): CoworkingOwnerHistoricalSessionRecord | null {
    const cached = this.inventories.resolveHistoricalRecord(session)
    if (cached) {
      // Why: only a selected proven record enters the bounded executor locator store.
      return this.source.retainOwnerHistoricalRecord(cached) ? cached : null
    }
    const record = this.source.resolveOwnerHistoricalRecord(session.ownerRecordKey)
    return record && matchesHistoricalSession(record, session) ? record : null
  }

  invalidateInstance(instanceId: string): void {
    this.pages.invalidateInstance(instanceId)
    this.inventories.clearInstance(instanceId)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  recordProvenProviderSession(
    worktree: CoworkingSessionWorktreeIdentity,
    provider: CoworkingProvenanceProvider,
    providerSessionId: string
  ): void {
    requireExactWorktreeIdentity(worktree)
    const changed = this.provenance.attest([
      {
        actualHostScope: worktree.actualHostScope,
        provider,
        providerSessionId,
        worktreeInstanceId: worktree.instanceId,
        coworkingIncarnationId: worktree.coworkingIncarnationId
      }
    ])
    if (changed) {
      this.provenanceChanged()
    }
  }

  close(): void {
    this.unsubscribeSource()
    this.clearSessionState()
    this.listeners.clear()
  }

  private clearSessionState(): void {
    this.pages.clear()
    this.inventories.clear()
  }

  private provenanceChanged(): void {
    this.clearSessionState()
    this.emitChange()
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        // Why: one catalog observer must not prevent later projections from invalidating.
        this.onListenerError(error)
      }
    }
  }
}

function defaultListenerError(): void {
  console.error('[coworking] Session catalog listener failed')
}
