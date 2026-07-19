import type { AuthenticatedSpoolPrincipal } from '../../shared/rpc-principal'
import { SpoolCatalogProjection } from './spool-catalog-projection'
import type { SpoolQuotaProjection } from './spool-quota-projection'
import type { SpoolShareCatalogSource } from './spool-share-catalog-source'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

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
