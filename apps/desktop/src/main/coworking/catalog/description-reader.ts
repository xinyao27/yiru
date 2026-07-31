import { COWORKING_CATALOG_MAX_WORKTREES } from '~shared/coworking/catalog-contract'

import { CoworkingExecutionError } from '../execution-error'
import type {
  CoworkingCatalogWorktreeDescription,
  CoworkingShareCatalogSource
} from '../share-catalog-source'
import type {
  CoworkingPublicWorktreeInstance,
  CoworkingWorktreeVisibility
} from '../worktree-visibility'
import { CoworkingCatalogDescriptionCache } from './description-cache'
import { sanitizeCatalogWorktreeDescription } from './projection-model'
import type { ResolvedCoworkingCatalogWorktree } from './projection-model'

type PublicationResolution =
  | { status: 'available'; instance: CoworkingPublicWorktreeInstance }
  | { status: 'fallback'; description: ResolvedCoworkingCatalogWorktree | null }

/** Reads fresh sanitized rows and owns the connection-scoped outage fallback. */
export class CoworkingCatalogDescriptionReader {
  private readonly cached = new CoworkingCatalogDescriptionCache()

  constructor(
    private readonly visibility: CoworkingWorktreeVisibility,
    private readonly source: CoworkingShareCatalogSource
  ) {}

  async read(): Promise<ResolvedCoworkingCatalogWorktree[]> {
    const visibility = this.visibility.snapshot()
    const publicCount = visibility.worktrees.filter((entry) => entry.visibility === 'public').length
    if (publicCount > COWORKING_CATALOG_MAX_WORKTREES) {
      // Why: an invalid persisted state must fail closed instead of hiding Public rows.
      throw new Error('coworking_catalog_publication_limit_exceeded')
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
    return resolved.filter((entry): entry is ResolvedCoworkingCatalogWorktree => entry !== null)
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
  ): Promise<ResolvedCoworkingCatalogWorktree | null> {
    const cached = this.cached.resolve(instanceId, shareEpoch)
    const initial = await this.resolvePublicationOrFallback(instanceId, shareEpoch, cached)
    if (initial.status === 'fallback') {
      return initial.description
    }
    const instance = initial.instance
    let description: CoworkingCatalogWorktreeDescription | null
    try {
      description = await this.source.describeWorktree(instance)
    } catch (error) {
      if (!isResourceUnavailable(error)) {
        throw error
      }
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
    cached: ResolvedCoworkingCatalogWorktree | null
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
  return error instanceof CoworkingExecutionError && error.code === 'resource_unavailable'
}
