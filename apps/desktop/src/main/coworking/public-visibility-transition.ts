import { COWORKING_CATALOG_MAX_WORKTREES } from '../../shared/coworking/catalog-contract'
import type { WorktreeMeta } from '../../shared/types'
import { revalidateCoworkingPublicationSnapshot } from './publication-final-guard'
import { CoworkingVisibilityError, rethrowPublicationResourceLimit } from './visibility-errors'
import type {
  CoworkingVisibilityPersistenceTransitions,
  CoworkingVisibilityStore
} from './visibility-persistence-transitions'
import type { CoworkingVisibilityTargetResolution } from './visibility-target-resolution'
import type { CoworkingOwnerWorktree } from './worktree-incarnation'
import type { CoworkingWorktreePublicationState } from './worktree-publication-state'
import type { CoworkingWorktreePublicationValidator } from './worktree-publication-validation'
import type { CoworkingWorktreeVisibilityOptions } from './worktree-visibility-contract'

type CoworkingPublicVisibilityTransitionOptions = {
  store: CoworkingVisibilityStore
  targets: CoworkingVisibilityTargetResolution
  validator: CoworkingWorktreePublicationValidator
  publicationState: CoworkingWorktreePublicationState
  persistence: CoworkingVisibilityPersistenceTransitions
  prepareFirstPublication: NonNullable<
    CoworkingWorktreeVisibilityOptions['prepareFirstPublication']
  >
}

/** Owns the validate, legacy-proof, final-guard, and durable Public sequence. */
export class CoworkingPublicVisibilityTransition {
  constructor(private readonly options: CoworkingPublicVisibilityTransitionOptions) {}

  async commit(targets: readonly CoworkingOwnerWorktree[]): Promise<void> {
    if (targets.length > COWORKING_CATALOG_MAX_WORKTREES) {
      throw new CoworkingVisibilityError('resource-limit')
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
      expectedMarkerId: meta.coworkingIncarnationId,
      requirePersistedMarker: meta.coworkingVisibility === 'public'
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
      throw new CoworkingVisibilityError('incarnation-changed')
    }
    if (!validationUsable || validation.ready.length !== targets.length) {
      throw validationFailure(validation.overlappingInstanceIds.length > 0)
    }
    const refreshInstanceIds = new Set(
      currentTargets
        .filter(({ meta }) => meta.coworkingVisibility !== 'public')
        .map(({ target }) => target.instanceId)
    )
    const preparedPersistence = await this.options.prepareFirstPublication(
      validation.ready,
      validation.registeredRoots,
      refreshInstanceIds
    )
    let finalGuard
    try {
      finalGuard = await revalidateCoworkingPublicationSnapshot(
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
      throw new CoworkingVisibilityError('incarnation-changed')
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
      (meta) => meta.coworkingVisibility === 'public'
    ).length
    const newPublicCount = targets.filter(
      ({ meta }) => meta.coworkingVisibility !== 'public'
    ).length
    if (currentPublicCount + newPublicCount > COWORKING_CATALOG_MAX_WORKTREES) {
      // Why: the V1 wire cap is an owner-side publication limit, never a truncation rule.
      throw new CoworkingVisibilityError('resource-limit')
    }
  }
}

function validationFailure(overlapping: boolean): CoworkingVisibilityError {
  return new CoworkingVisibilityError(overlapping ? 'overlapping-root' : 'not-shareable')
}
