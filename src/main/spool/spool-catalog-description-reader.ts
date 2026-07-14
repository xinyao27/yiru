import { SPOOL_CATALOG_MAX_WORKTREES } from '../../shared/spool/spool-catalog-contract'
import { SpoolCatalogDescriptionCache } from './spool-catalog-description-cache'
import { sanitizeCatalogWorktreeDescription } from './spool-catalog-projection-model'
import type { ResolvedSpoolCatalogWorktree } from './spool-catalog-projection-model'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolCatalogWorktreeDescription,
  SpoolShareCatalogSource
} from './spool-share-catalog'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

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
    let instance
    try {
      instance = await this.visibility.resolvePublicInstance(instanceId, shareEpoch)
    } catch (error) {
      if (isResourceUnavailable(error) && this.visibility.isPublic(instanceId, shareEpoch)) {
        return cached
      }
      throw error
    }
    if (!instance) {
      this.cached.invalidate(instanceId)
      return null
    }
    let description: SpoolCatalogWorktreeDescription | null
    try {
      description = await this.source.describeWorktree(instance)
    } catch {
      // Why: only the previous sanitized row survives a source outage; raw owner data is not cached.
      try {
        const current = await this.visibility.resolvePublicInstance(instanceId, shareEpoch)
        if (!current) {
          this.cached.invalidate(instanceId)
          return null
        }
        return cached
      } catch (error) {
        if (isResourceUnavailable(error) && this.visibility.isPublic(instanceId, shareEpoch)) {
          return cached
        }
        throw error
      }
    }
    if (!description) {
      this.cached.invalidate(instanceId)
      return null
    }
    let current
    try {
      current = await this.visibility.resolvePublicInstance(instanceId, shareEpoch)
    } catch (error) {
      if (isResourceUnavailable(error) && this.visibility.isPublic(instanceId, shareEpoch)) {
        return cached
      }
      throw error
    }
    if (!current || current.worktreeId !== instance.worktreeId) {
      this.cached.invalidate(instanceId)
      return null
    }
    const sanitized = sanitizeCatalogWorktreeDescription(current, description)
    if (!sanitized) {
      this.cached.invalidate(instanceId)
      return null
    }
    return this.cached.remember(sanitized)
  }
}

function isResourceUnavailable(error: unknown): boolean {
  return error instanceof SpoolExecutionError && error.code === 'resource_unavailable'
}
