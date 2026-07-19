import { SPOOL_CATALOG_MAX_WORKTREES } from '../../shared/spool/spool-catalog-contract'
import type { WorktreeMeta } from '../../shared/types'
import { revalidateSpoolPublicationSnapshot } from './spool-publication-final-guard'
import { SpoolVisibilityError, rethrowPublicationResourceLimit } from './spool-visibility-errors'
import type {
  SpoolVisibilityPersistenceTransitions,
  SpoolVisibilityStore
} from './spool-visibility-persistence-transitions'
import type { SpoolVisibilityTargetResolution } from './spool-visibility-target-resolution'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import type { SpoolWorktreePublicationState } from './spool-worktree-publication-state'
import type { SpoolWorktreePublicationValidator } from './spool-worktree-publication-validation'
import type { SpoolWorktreeVisibilityOptions } from './spool-worktree-visibility-contract'

type SpoolPublicVisibilityTransitionOptions = {
  store: SpoolVisibilityStore
  targets: SpoolVisibilityTargetResolution
  validator: SpoolWorktreePublicationValidator
  publicationState: SpoolWorktreePublicationState
  persistence: SpoolVisibilityPersistenceTransitions
  prepareFirstPublication: NonNullable<SpoolWorktreeVisibilityOptions['prepareFirstPublication']>
}

/** Owns the validate, legacy-proof, final-guard, and durable Public sequence. */
export class SpoolPublicVisibilityTransition {
  constructor(private readonly options: SpoolPublicVisibilityTransitionOptions) {}

  async commit(targets: readonly SpoolOwnerWorktree[]): Promise<void> {
    if (targets.length > SPOOL_CATALOG_MAX_WORKTREES) {
      throw new SpoolVisibilityError('resource-limit')
    }
    this.options.targets.requireUnique(targets)
    if (targets.length === 0) {
      return
    }
    const currentTargets = targets.map((target) => ({
      target,
      meta: this.options.targets.requireCurrentMeta(target)
    }))
    this.requirePublicCapacity(currentTargets)
    const candidates = currentTargets.map(({ target, meta }) => ({
      target,
      expectedMarkerId: meta.spoolIncarnationId,
      requirePersistedMarker: meta.spoolVisibility === 'public'
    }))
    let validation
    try {
      validation = await this.options.validator.validate(candidates)
    } catch (error) {
      rethrowPublicationResourceLimit(error)
    }
    const validationUsable = this.options.publicationState.applyValidationSuspensions(validation)
    if (validation.replaced.length > 0) {
      this.options.persistence.rotateReplaced(validation.replaced)
      throw new SpoolVisibilityError('incarnation-changed')
    }
    if (!validationUsable || validation.ready.length !== targets.length) {
      throw validationFailure(validation.overlappingInstanceIds.length > 0)
    }
    const refreshInstanceIds = new Set(
      currentTargets
        .filter(({ meta }) => meta.spoolVisibility !== 'public')
        .map(({ target }) => target.instanceId)
    )
    const preparedPersistence = await this.options.prepareFirstPublication(
      validation.ready,
      validation.registeredRoots,
      refreshInstanceIds
    )
    let finalGuard
    try {
      finalGuard = await revalidateSpoolPublicationSnapshot(
        this.options.validator,
        validation,
        validation.ready
      )
    } catch (error) {
      rethrowPublicationResourceLimit(error)
    }
    const finalValidationUsable = this.options.publicationState.applyValidationSuspensions(
      finalGuard.validation
    )
    if (finalGuard.validation.replaced.length > 0) {
      this.options.persistence.rotateReplaced(finalGuard.validation.replaced)
      throw new SpoolVisibilityError('incarnation-changed')
    }
    if (!finalValidationUsable || !finalGuard.stable) {
      if (!finalGuard.stable) {
        // Why: proofs from a long scan are valid only for its complete registered-root snapshot.
        this.options.publicationState.suspend(
          validation.ready.map((entry) => entry.target.instanceId),
          'incarnation-unavailable'
        )
      }
      throw validationFailure(finalGuard.validation.overlappingInstanceIds.length > 0)
    }
    this.options.persistence.commitPublic(finalGuard.validation.ready, preparedPersistence)
  }

  private requirePublicCapacity(targets: readonly { meta: WorktreeMeta }[]): void {
    const currentPublicCount = Object.values(this.options.store.getAllWorktreeMeta()).filter(
      (meta) => meta.spoolVisibility === 'public'
    ).length
    const newPublicCount = targets.filter(({ meta }) => meta.spoolVisibility !== 'public').length
    if (currentPublicCount + newPublicCount > SPOOL_CATALOG_MAX_WORKTREES) {
      // Why: the V1 wire cap is an owner-side publication limit, never a truncation rule.
      throw new SpoolVisibilityError('resource-limit')
    }
  }
}

function validationFailure(overlapping: boolean): SpoolVisibilityError {
  return new SpoolVisibilityError(overlapping ? 'overlapping-root' : 'not-shareable')
}
