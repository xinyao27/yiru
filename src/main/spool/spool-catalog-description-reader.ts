import { SPOOL_CATALOG_MAX_WORKTREES } from '../../shared/spool/spool-catalog-contract'
import { SpoolCatalogDescriptionCache } from './spool-catalog-description-cache'
import { sanitizeCatalogWorktreeDescription } from './spool-catalog-projection-model'
import type { ResolvedSpoolCatalogWorktree } from './spool-catalog-projection-model'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolCatalogWorktreeDescription,
  SpoolShareCatalogSource
} from './spool-share-catalog'
import type {
  SpoolPublicWorktreeInstance,
  SpoolWorktreeVisibility
} from './spool-worktree-visibility'

type PublicationResolution =
  | { status: 'available'; instance: SpoolPublicWorktreeInstance }
  | { status: 'fallback'; description: ResolvedSpoolCatalogWorktree | null }

/** Reads fresh sanitized rows and owns the connection-scoped outage fallback. */
export class SpoolCatalogDescriptionReader {
  private readonly cached = new SpoolCatalogDescriptionCache()

  constructor(
    private readonly visibility: SpoolWorktreeVisibility,
    private readonly source: SpoolShareCatalogSource
  ) {}

  async read(): Promise<ResolvedSpoolCatalogWorktree[]> {
    const visibility = this.visibility.snapshot()
    const publicCount = visibility.worktrees.filter((entry) => entry.visibility === 'public').length
    if (publicCount > SPOOL_CATALOG_MAX_WORKTREES) {
      // Why: an invalid persisted state must fail closed instead of hiding Public rows.
      throw new Error('spool_catalog_publication_limit_exceeded')
    }
    const published = visibility.worktrees.filter(
      (entry) =>
        entry.shareEpoch &&
        (entry.publicationStatus === 'published' ||
          (entry.publicationStatus === 'suspended' &&
            entry.suspensionReason === 'host-unavailable'))
    )
    const resolved = await Promise.all(
      published.map((entry) => this.readOne(entry.instanceId, entry.shareEpoch as string))
    )
    return resolved.filter((entry): entry is ResolvedSpoolCatalogWorktree => entry !== null)
  }

  invalidate(instanceId: string): void {
    this.cached.invalidate(instanceId)
  }

  clear(): void {
    this.cached.clear()
  }

  private async readOne(
    instanceId: string,
    shareEpoch: string
  ): Promise<ResolvedSpoolCatalogWorktree | null> {
    const cached = this.cached.resolve(instanceId, shareEpoch)
    const initial = await this.resolvePublicationOrFallback(instanceId, shareEpoch, cached)
    if (initial.status === 'fallback') {
      return initial.description
    }
    const instance = initial.instance
    let description: SpoolCatalogWorktreeDescription | null
    try {
      description = await this.source.describeWorktree(instance)
    } catch {
      // Why: only the previous sanitized row survives a source outage; raw owner data is not cached.
      const current = await this.resolvePublicationOrFallback(instanceId, shareEpoch, cached)
      return current.status === 'available' ? cached : current.description
    }
    if (!description) {
      this.cached.invalidate(instanceId)
      return null
    }
    const current = await this.resolvePublicationOrFallback(instanceId, shareEpoch, cached)
    if (current.status === 'fallback') {
      return current.description
    }
    if (current.instance.worktreeId !== instance.worktreeId) {
      this.cached.invalidate(instanceId)
      return null
    }
    const sanitized = sanitizeCatalogWorktreeDescription(current.instance, description)
    if (!sanitized) {
      this.cached.invalidate(instanceId)
      return null
    }
    return this.cached.remember(sanitized)
  }

  private async resolvePublicationOrFallback(
    instanceId: string,
    shareEpoch: string,
    cached: ResolvedSpoolCatalogWorktree | null
  ): Promise<PublicationResolution> {
    try {
      const instance = await this.visibility.resolvePublicInstance(instanceId, shareEpoch)
      if (instance) {
        return { status: 'available', instance }
      }
      this.cached.invalidate(instanceId)
      return { status: 'fallback', description: null }
    } catch (error) {
      if (isResourceUnavailable(error) && this.visibility.isPublic(instanceId, shareEpoch)) {
        return { status: 'fallback', description: cached }
      }
      throw error
    }
  }
}

function isResourceUnavailable(error: unknown): boolean {
  return error instanceof SpoolExecutionError && error.code === 'resource_unavailable'
}
