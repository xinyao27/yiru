import { mapWithConcurrency } from '~shared/map-with-concurrency'

import type {
  CoworkingOwnerWorktreeCatalog,
  CoworkingOwnerWorktreeCatalogInventory
} from './owner/worktree-catalog-contract'
import {
  CoworkingOwnerWorktreeCatalogError,
  CoworkingPublicationValidationError,
  isPublicationResourceLimit
} from './publication-errors'
import {
  COWORKING_PUBLICATION_MAX_REGISTERED_REPOS,
  COWORKING_PUBLICATION_ROOT_RESOLUTION_CONCURRENCY
} from './publication-inventory-limits'
import {
  sameCoworkingFolderRepoRoot,
  sameCoworkingWorktreeRoot,
  unavailableSourceAffectsTarget,
  unresolvedRegisteredRootReason,
  type CoworkingRegisteredRootResolution
} from './publication-root-availability'
import {
  captureCoworkingRegisteredInventory,
  createEmptyCoworkingPublicationValidation,
  sameCoworkingOwnerWorktreeSnapshotTarget
} from './publication-snapshot-guard'
import {
  addUnavailableCoworkingPublication,
  assertCoworkingPublicationCandidateCapacity,
  assertCoworkingWorktreeInventoryCapacity,
  assertUniqueCoworkingPublicationTargets,
  coworkingPublicationTargetIdentityKey,
  type UnavailableCoworkingPublication
} from './publication-validation-guards'
import type {
  CoworkingWorktreeIncarnation,
  CoworkingOwnerWorktree,
  CoworkingRegisteredWorktreeRoot,
  CoworkingWorktreeRootComparison
} from './worktree-incarnation'

export {
  CoworkingOwnerWorktreeCatalogError,
  CoworkingPublicationValidationError,
  isPublicationResourceLimit
} from './publication-errors'

export type {
  CoworkingOwnerWorktreeCatalog,
  CoworkingOwnerWorktreeCatalogInventory,
  CoworkingUnavailableCatalogSource
} from './owner/worktree-catalog-contract'

export type CoworkingPublicationCandidate = {
  target: CoworkingOwnerWorktree
  expectedMarkerId?: string
  requirePersistedMarker?: boolean
}

export type PreparedCoworkingPublication = {
  target: CoworkingOwnerWorktree
  markerId: string
  root: CoworkingWorktreeRootComparison
}

export type ReplacedCoworkingPublication = PreparedCoworkingPublication

export type { UnavailableCoworkingPublication } from './publication-validation-guards'

export type CoworkingPublicationValidation = {
  ready: readonly PreparedCoworkingPublication[]
  registeredInventory: CoworkingOwnerWorktreeCatalogInventory
  registeredRoots: readonly CoworkingRegisteredWorktreeRoot[]
  replaced: readonly ReplacedCoworkingPublication[]
  unavailable: readonly UnavailableCoworkingPublication[]
  overlappingInstanceIds: readonly string[]
}

/** Resolves a publication batch once and proves it against every registered root. */
export class CoworkingWorktreePublicationValidator {
  constructor(
    private readonly catalog: CoworkingOwnerWorktreeCatalog,
    private readonly incarnation: CoworkingWorktreeIncarnation
  ) {}

  async validate(
    candidates: readonly CoworkingPublicationCandidate[]
  ): Promise<CoworkingPublicationValidation> {
    assertCoworkingPublicationCandidateCapacity(candidates.length)
    const capturedCandidates = candidates.map((candidate) => ({
      ...candidate,
      target: { ...candidate.target }
    }))
    assertUniqueCoworkingPublicationTargets(capturedCandidates.map((candidate) => candidate.target))
    const resolutions = await mapWithConcurrency(
      capturedCandidates,
      COWORKING_PUBLICATION_ROOT_RESOLUTION_CONCURRENCY,
      async (candidate) => ({
        candidate,
        resolution: await this.incarnation.preparePublication(
          candidate.target,
          candidate.expectedMarkerId
        )
      })
    )
    const prepared: PreparedCoworkingPublication[] = []
    const replaced: ReplacedCoworkingPublication[] = []
    const unavailable: UnavailableCoworkingPublication[] = []
    for (const { candidate, resolution } of resolutions) {
      if (resolution.status === 'unavailable') {
        unavailable.push({
          instanceId: candidate.target.instanceId,
          reason: resolution.reason
        })
      } else {
        const entry = {
          target: candidate.target,
          markerId: resolution.markerId,
          root: resolution.root
        }
        // Why: persisted Public metadata without its proof cannot establish
        // which path incarnation the owner originally published.
        if (
          resolution.status === 'replaced' ||
          (candidate.requirePersistedMarker && !candidate.expectedMarkerId)
        ) {
          replaced.push(entry)
        } else {
          prepared.push(entry)
        }
      }
    }
    if (prepared.length === 0) {
      return createEmptyCoworkingPublicationValidation(replaced, unavailable)
    }

    const inventory = await this.readRegisteredOrMarkUnavailable(prepared, unavailable)
    if (!inventory) {
      return createEmptyCoworkingPublicationValidation(replaced, unavailable)
    }
    for (const entry of prepared) {
      if (
        inventory.unavailableSources.some((source) =>
          unavailableSourceAffectsTarget(source, entry.target, entry.root.scopeKey)
        )
      ) {
        addUnavailableCoworkingPublication(unavailable, entry.target.instanceId, 'host-unavailable')
      }
    }
    const roots = await this.resolveRegisteredRoots(inventory.worktrees, prepared)
    const registeredRoots = roots.flatMap((entry) =>
      entry.root ? [{ target: entry.target, root: entry.root }] : []
    )
    for (const candidate of prepared) {
      const reason = unresolvedRegisteredRootReason(
        candidate.target.executionHostId,
        candidate.root.scopeKey,
        roots
      )
      if (reason) {
        // Why: an unknown root can overlap only roots on its actual execution host.
        addUnavailableCoworkingPublication(unavailable, candidate.target.instanceId, reason)
      }
    }

    const registeredByInstance = new Map(
      inventory.worktrees.map(
        (target) => [coworkingPublicationTargetIdentityKey(target), target] as const
      )
    )
    const overlapping = new Set<string>()
    for (const candidate of prepared) {
      const registered = registeredByInstance.get(
        coworkingPublicationTargetIdentityKey(candidate.target)
      )
      if (!registered || !sameCoworkingOwnerWorktreeSnapshotTarget(candidate.target, registered)) {
        addUnavailableCoworkingPublication(
          unavailable,
          candidate.target.instanceId,
          'ambiguous-root'
        )
        continue
      }
      for (const entry of roots) {
        if (
          coworkingPublicationTargetIdentityKey(entry.target) !==
            coworkingPublicationTargetIdentityKey(candidate.target) &&
          entry.root &&
          this.incarnation.rootsOverlap(candidate.root, entry.root) &&
          !sameCoworkingFolderRepoRoot(candidate.target, candidate.root, entry.target, entry.root)
        ) {
          overlapping.add(candidate.target.instanceId)
          // Why: a newly registered Private descendant can disclose through an
          // already Public ancestor, so both sides lose effective publication.
          overlapping.add(entry.target.instanceId)
        }
      }
    }
    const blocked = new Set(unavailable.map((entry) => entry.instanceId))
    const overlapReady = prepared.filter(
      (entry) => !blocked.has(entry.target.instanceId) && !overlapping.has(entry.target.instanceId)
    )
    const ready = await this.retainStableCandidates(overlapReady, replaced, unavailable)
    return {
      ready,
      registeredInventory: inventory,
      registeredRoots,
      replaced,
      unavailable,
      overlappingInstanceIds: [...overlapping]
    }
  }

  private async retainStableCandidates(
    candidates: readonly PreparedCoworkingPublication[],
    replaced: ReplacedCoworkingPublication[],
    unavailable: UnavailableCoworkingPublication[]
  ): Promise<PreparedCoworkingPublication[]> {
    const stable: PreparedCoworkingPublication[] = []
    for (const candidate of candidates) {
      const resolution = await this.incarnation.preparePublication(
        candidate.target,
        candidate.markerId
      )
      if (resolution.status === 'unavailable') {
        addUnavailableCoworkingPublication(
          unavailable,
          candidate.target.instanceId,
          resolution.reason
        )
      } else if (resolution.status === 'replaced') {
        replaced.push({
          target: candidate.target,
          markerId: resolution.markerId,
          root: resolution.root
        })
      } else if (sameCoworkingWorktreeRoot(candidate.root, resolution.root)) {
        stable.push(candidate)
      } else {
        // Why: a root that changed during overlap inspection was never proven
        // against the registered-root set used for this publication.
        addUnavailableCoworkingPublication(
          unavailable,
          candidate.target.instanceId,
          'ambiguous-root'
        )
      }
    }
    return stable
  }

  private async readRegisteredOrMarkUnavailable(
    prepared: readonly PreparedCoworkingPublication[],
    unavailable: UnavailableCoworkingPublication[]
  ): Promise<CoworkingOwnerWorktreeCatalogInventory | null> {
    try {
      const inventory = await this.catalog.inspectRegisteredWorktrees()
      assertCoworkingWorktreeInventoryCapacity(inventory.worktrees.length)
      if (inventory.unavailableSources.length > COWORKING_PUBLICATION_MAX_REGISTERED_REPOS) {
        throw new CoworkingPublicationValidationError('resource-limit')
      }
      assertUniqueCoworkingPublicationTargets(inventory.worktrees)
      return captureCoworkingRegisteredInventory(inventory)
    } catch (error) {
      if (isPublicationResourceLimit(error)) {
        throw error
      }
      const reason =
        (error instanceof CoworkingOwnerWorktreeCatalogError && error.code === 'ambiguous') ||
        error instanceof CoworkingPublicationValidationError
          ? 'ambiguous-root'
          : 'host-unavailable'
      for (const entry of prepared) {
        addUnavailableCoworkingPublication(unavailable, entry.target.instanceId, reason)
      }
      return null
    }
  }

  private async resolveRegisteredRoots(
    registered: readonly CoworkingOwnerWorktree[],
    prepared: readonly PreparedCoworkingPublication[]
  ): Promise<readonly CoworkingRegisteredRootResolution[]> {
    const preparedByTarget = new Map(
      prepared.map((entry) => [coworkingPublicationTargetIdentityKey(entry.target), entry] as const)
    )
    return await mapWithConcurrency(
      registered,
      COWORKING_PUBLICATION_ROOT_RESOLUTION_CONCURRENCY,
      async (target) => {
        const candidate = preparedByTarget.get(coworkingPublicationTargetIdentityKey(target))
        if (candidate) {
          return { target, root: candidate.root }
        }
        const resolved = await this.incarnation.resolveRoot(target)
        return resolved.status === 'resolved'
          ? { target, root: resolved.root }
          : {
              target,
              root: null,
              reason: resolved.reason,
              ...(resolved.actualHostScope ? { actualHostScope: resolved.actualHostScope } : {})
            }
      }
    )
  }
}
