import type {
  SpoolVisibilityPersistenceTransitions,
  SpoolVisibilityStore
} from './spool-visibility-persistence-transitions'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolWorktreeIncarnation } from './spool-worktree-incarnation'
import type {
  SpoolPublicWorktreeInstance,
  SpoolWorktreePublicationState
} from './spool-worktree-publication-state'
import {
  SpoolOwnerWorktreeCatalogError,
  type SpoolPublicationValidation,
  type SpoolOwnerWorktreeCatalog,
  type SpoolPublicationCandidate,
  type SpoolWorktreePublicationValidator
} from './spool-worktree-publication-validation'

type SpoolVisibilityPublicationRevalidationOptions = {
  store: SpoolVisibilityStore
  catalog: SpoolOwnerWorktreeCatalog
  incarnation: SpoolWorktreeIncarnation
  validator: SpoolWorktreePublicationValidator
  publicationState: SpoolWorktreePublicationState
  persistence: SpoolVisibilityPersistenceTransitions
  isPublic(instanceId: string, shareEpoch: string): boolean
}

/** Revalidates already-Public worktrees without owning visibility transitions. */
export class SpoolVisibilityPublicationRevalidation {
  constructor(private readonly options: SpoolVisibilityPublicationRevalidationOptions) {}

  async resolvePublicInstance(
    instanceId: string,
    shareEpoch: string
  ): Promise<SpoolPublicWorktreeInstance | null> {
    if (!this.options.isPublic(instanceId, shareEpoch)) {
      return null
    }
    let target
    try {
      target = await this.options.catalog.getWorktreeByInstance(instanceId)
    } catch (error) {
      return this.handleCatalogFailure(instanceId, error)
    }
    if (!target) {
      this.options.publicationState.invalidate([instanceId], 'deleted')
      return null
    }
    const meta = this.options.store.getWorktreeMeta(target.worktreeId)
    if (!meta || meta.instanceId !== instanceId || meta.spoolVisibility !== 'public') {
      this.options.publicationState.invalidate([instanceId], 'private')
      return null
    }
    const validation = await this.options.validator.validate([
      {
        target,
        expectedMarkerId: meta.spoolIncarnationId,
        requirePersistedMarker: true
      }
    ])
    if (validation.replaced.length > 0) {
      this.options.persistence.rotateReplaced(validation.replaced)
      return null
    }
    const validationUsable = this.options.publicationState.applyValidationSuspensions(validation)
    if (hasHostUnavailable(validation, instanceId)) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (!validationUsable) {
      return null
    }
    const ready = validation.ready[0]
    if (!ready) {
      return null
    }
    if (!this.options.publicationState.matches(instanceId, shareEpoch, ready)) {
      // Why: a stable share epoch cannot silently move to a different actual-host root.
      this.options.publicationState.suspend([instanceId], 'incarnation-unavailable')
      return null
    }
    this.options.publicationState.publish(ready)
    return this.options.publicationState.get(instanceId, shareEpoch)
  }

  async revalidateMutationTarget(
    instanceId: string,
    shareEpoch: string
  ): Promise<SpoolPublicWorktreeInstance | null> {
    const published = this.options.publicationState.get(instanceId, shareEpoch)
    if (!published || !this.options.isPublic(instanceId, shareEpoch)) {
      return null
    }
    const meta = this.options.store.getWorktreeMeta(published.worktreeId)
    if (!meta || meta.instanceId !== instanceId || meta.spoolVisibility !== 'public') {
      this.options.publicationState.invalidate([instanceId], 'private')
      return null
    }
    // Why: bind already proved every registered root; the per-keystroke guard
    // rechecks this host marker without rescanning unrelated repositories.
    const resolution = await this.options.incarnation.preparePublication(
      published.target,
      meta.spoolIncarnationId
    )
    if (resolution.status === 'unavailable') {
      this.options.publicationState.suspend(
        [instanceId],
        resolution.reason === 'host-unavailable' ? 'host-unavailable' : 'incarnation-unavailable'
      )
      if (resolution.reason === 'host-unavailable') {
        throw new SpoolExecutionError('resource_unavailable')
      }
      return null
    }
    const prepared = {
      target: published.target,
      markerId: resolution.markerId,
      root: resolution.root
    }
    if (resolution.status === 'replaced' || !meta.spoolIncarnationId) {
      this.options.persistence.rotateReplaced([prepared])
      return null
    }
    if (!this.options.publicationState.matches(instanceId, shareEpoch, prepared)) {
      this.options.publicationState.suspend([instanceId], 'incarnation-unavailable')
      return null
    }
    this.options.publicationState.publish(prepared)
    return this.options.publicationState.get(instanceId, shareEpoch)
  }

  async revalidatePersistedPublic(): Promise<void> {
    const candidates: SpoolPublicationCandidate[] = []
    for (const [worktreeId, meta] of Object.entries(this.options.store.getAllWorktreeMeta())) {
      if (meta.spoolVisibility !== 'public' || !meta.instanceId) {
        continue
      }
      let target
      try {
        target = await this.options.catalog.getWorktree(worktreeId)
      } catch (error) {
        this.suspendCatalogFailure(meta.instanceId, error)
        continue
      }
      if (!target || target.instanceId !== meta.instanceId) {
        this.options.publicationState.invalidate([meta.instanceId], 'deleted')
      } else {
        candidates.push({
          target,
          expectedMarkerId: meta.spoolIncarnationId,
          requirePersistedMarker: true
        })
      }
    }
    if (candidates.length === 0) {
      return
    }
    const validation = await this.options.validator.validate(candidates)
    this.options.publicationState.applyValidationSuspensions(validation)
    if (validation.replaced.length > 0) {
      this.options.persistence.rotateReplaced(validation.replaced)
    }
    const continuing = validation.ready.filter((entry) => {
      const published = this.options.publicationState.get(entry.target.instanceId)
      if (
        published &&
        !this.options.publicationState.matches(entry.target.instanceId, published.shareEpoch, entry)
      ) {
        this.options.publicationState.suspend([entry.target.instanceId], 'incarnation-unavailable')
        return false
      }
      return true
    })
    if (continuing.length > 0) {
      this.options.persistence.commitPublic(continuing)
    }
  }

  private handleCatalogFailure(
    instanceId: string,
    error: unknown
  ): SpoolPublicWorktreeInstance | null {
    this.suspendCatalogFailure(instanceId, error)
    if (!isAmbiguousCatalogFailure(error)) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    return null
  }

  private suspendCatalogFailure(instanceId: string, error: unknown): void {
    if (isAmbiguousCatalogFailure(error)) {
      this.options.publicationState.suspend([instanceId], 'incarnation-unavailable')
    } else {
      // Why: route/scan availability says nothing about the already-proven marker identity.
      this.options.publicationState.suspend([instanceId], 'host-unavailable')
    }
  }
}

function isAmbiguousCatalogFailure(error: unknown): boolean {
  return error instanceof SpoolOwnerWorktreeCatalogError && error.code === 'ambiguous'
}

function hasHostUnavailable(validation: SpoolPublicationValidation, instanceId: string): boolean {
  return validation.unavailable.some(
    (entry) => entry.instanceId === instanceId && entry.reason === 'host-unavailable'
  )
}
