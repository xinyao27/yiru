import type { AuthenticatedCoworkingPrincipal } from '../../shared/rpc-principal'
import { CoworkingCatalogProjection } from './catalog/projection'
import type { CoworkingQuotaProjection } from './quota-projection'
import type { CoworkingShareCatalogSource } from './share-catalog-source'
import type { CoworkingWorktreeVisibility } from './worktree-visibility'

export class CoworkingShareCatalog {
  private readonly projections = new Map<string, CoworkingCatalogProjection>()
  private readonly unsubscribeVisibility: () => void
  private readonly unsubscribeSource: () => void
  private readonly unsubscribeQuota: () => void

  constructor(
    private readonly ownerRuntimeId: string,
    private readonly visibility: CoworkingWorktreeVisibility,
    private readonly source: CoworkingShareCatalogSource,
    private readonly quota: CoworkingQuotaProjection
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

  openProjection(principal: AuthenticatedCoworkingPrincipal): CoworkingCatalogProjection {
    this.closeProjection(principal.connectionId)
    const projection = new CoworkingCatalogProjection(
      principal.connectionId,
      this.ownerRuntimeId,
      this.visibility,
      this.source,
      this.quota
    )
    this.projections.set(principal.connectionId, projection)
    return projection
  }

  getProjection(connectionId: string): CoworkingCatalogProjection | null {
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
