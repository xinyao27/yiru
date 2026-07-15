import {
  matchesHistoricalSession,
  SpoolSessionInventoryCache
} from './spool-session-inventory-cache'
import {
  SpoolSessionPageChains,
  type SpoolSessionCatalogPageResult
} from './spool-session-page-chains'
import { SpoolSessionPageProjector } from './spool-session-page-projector'
import type {
  SpoolResolvedHistoricalSession,
  SpoolResolvedSession
} from './spool-session-resolution'
import type {
  SpoolHistoricalSessionConsistency,
  SpoolOwnerHistoricalSessionRecord,
  SpoolSessionSource,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type {
  SpoolProvenanceProvider,
  SpoolSessionProvenanceIndex
} from './spool-session-provenance-index'
import { requireExactWorktreeIdentity, toSessionWorktree } from './spool-session-worktree-binding'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

export type { SpoolSessionCatalogPageResult } from './spool-session-page-chains'
export type {
  SpoolResolvedHistoricalSession,
  SpoolResolvedLiveSession,
  SpoolResolvedSession,
  SpoolSessionCatalogDescription
} from './spool-session-resolution'

export class SpoolSessionCatalog {
  private readonly listeners = new Set<() => void>()
  private readonly inventories = new SpoolSessionInventoryCache()
  private readonly pages: SpoolSessionPageChains
  private readonly unsubscribeSource: () => void

  constructor(
    private readonly provenance: SpoolSessionProvenanceIndex,
    private readonly source: SpoolSessionSource,
    historicalConsistency: SpoolHistoricalSessionConsistency,
    private readonly onListenerError: (error: unknown) => void = defaultListenerError
  ) {
    this.pages = new SpoolSessionPageChains(
      new SpoolSessionPageProjector(
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
    instance: SpoolPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string,
    signal: AbortSignal
  ): Promise<SpoolSessionCatalogPageResult> {
    return await this.pages.listPage(instance, cursor, inventoryScope, signal)
  }

  releaseSessionPage(
    instance: SpoolPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string
  ): void {
    this.pages.release(instance, cursor, inventoryScope)
  }

  resolveSession(
    instance: SpoolPublicWorktreeInstance,
    sessionKey: string
  ): SpoolResolvedSession | null {
    const worktree = toSessionWorktree(instance)
    requireExactWorktreeIdentity(worktree)
    // Why: a wire session reference only exists after its page populated this owner-only cache.
    return this.inventories.resolveSession(worktree, sessionKey)
  }

  resolveHistoricalRecord(
    session: SpoolResolvedHistoricalSession
  ): SpoolOwnerHistoricalSessionRecord | null {
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
    worktree: SpoolSessionWorktreeIdentity,
    provider: SpoolProvenanceProvider,
    providerSessionId: string
  ): void {
    requireExactWorktreeIdentity(worktree)
    const changed = this.provenance.attest([
      {
        actualHostScope: worktree.actualHostScope,
        provider,
        providerSessionId,
        worktreeInstanceId: worktree.instanceId,
        spoolIncarnationId: worktree.spoolIncarnationId
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
  console.error('[spool] Session catalog listener failed')
}
