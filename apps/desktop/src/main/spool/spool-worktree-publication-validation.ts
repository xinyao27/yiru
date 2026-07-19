import { mapWithConcurrency } from '../../shared/map-with-concurrency'
import type {
  SpoolOwnerWorktreeCatalog,
  SpoolOwnerWorktreeCatalogInventory
} from './spool-owner-worktree-catalog-contract'
import {
  SpoolOwnerWorktreeCatalogError,
  SpoolPublicationValidationError,
  isPublicationResourceLimit
} from './spool-publication-errors'
import {
  SPOOL_PUBLICATION_MAX_REGISTERED_REPOS,
  SPOOL_PUBLICATION_ROOT_RESOLUTION_CONCURRENCY
} from './spool-publication-inventory-limits'
import {
  sameSpoolFolderRepoRoot,
  sameSpoolWorktreeRoot,
  unavailableSourceAffectsTarget,
  unresolvedRegisteredRootReason,
  type SpoolRegisteredRootResolution
} from './spool-publication-root-availability'
import {
  captureSpoolRegisteredInventory,
  createEmptySpoolPublicationValidation,
  sameSpoolOwnerWorktreeSnapshotTarget
} from './spool-publication-snapshot-guard'
import {
  addUnavailableSpoolPublication,
  assertSpoolPublicationCandidateCapacity,
  assertSpoolWorktreeInventoryCapacity,
  assertUniqueSpoolPublicationTargets,
  spoolPublicationTargetIdentityKey,
  type UnavailableSpoolPublication
} from './spool-publication-validation-guards'
import type {
  SpoolWorktreeIncarnation,
  SpoolOwnerWorktree,
  SpoolRegisteredWorktreeRoot,
  SpoolWorktreeRootComparison
} from './spool-worktree-incarnation'

export {
  SpoolOwnerWorktreeCatalogError,
  SpoolPublicationValidationError,
  isPublicationResourceLimit
} from './spool-publication-errors'

export type {
  SpoolOwnerWorktreeCatalog,
  SpoolOwnerWorktreeCatalogInventory,
  SpoolUnavailableCatalogSource
} from './spool-owner-worktree-catalog-contract'

export type SpoolPublicationCandidate = {
  target: SpoolOwnerWorktree
  expectedMarkerId?: string
  requirePersistedMarker?: boolean
}

export type PreparedSpoolPublication = {
  target: SpoolOwnerWorktree
  markerId: string
  root: SpoolWorktreeRootComparison
}

export type ReplacedSpoolPublication = PreparedSpoolPublication

export type { UnavailableSpoolPublication } from './spool-publication-validation-guards'

export type SpoolPublicationValidation = {
  ready: readonly PreparedSpoolPublication[]
  registeredInventory: SpoolOwnerWorktreeCatalogInventory
  registeredRoots: readonly SpoolRegisteredWorktreeRoot[]
  replaced: readonly ReplacedSpoolPublication[]
  unavailable: readonly UnavailableSpoolPublication[]
  overlappingInstanceIds: readonly string[]
}

/** Resolves a publication batch once and proves it against every registered root. */
export class SpoolWorktreePublicationValidator {
  constructor(
    private readonly catalog: SpoolOwnerWorktreeCatalog,
    private readonly incarnation: SpoolWorktreeIncarnation
  ) {}

  async validate(
    candidates: readonly SpoolPublicationCandidate[]
  ): Promise<SpoolPublicationValidation> {
    assertSpoolPublicationCandidateCapacity(candidates.length)
    const capturedCandidates = candidates.map((candidate) => ({
      ...candidate,
      target: { ...candidate.target }
    }))
    assertUniqueSpoolPublicationTargets(capturedCandidates.map((candidate) => candidate.target))
    const resolutions = await mapWithConcurrency(
      capturedCandidates,
      SPOOL_PUBLICATION_ROOT_RESOLUTION_CONCURRENCY,
      async (candidate) => ({
        candidate,
        resolution: await this.incarnation.preparePublication(
          candidate.target,
          candidate.expectedMarkerId
        )
      })
    )
    const prepared: PreparedSpoolPublication[] = []
    const replaced: ReplacedSpoolPublication[] = []
    const unavailable: UnavailableSpoolPublication[] = []
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
      return createEmptySpoolPublicationValidation(replaced, unavailable)
    }

    const inventory = await this.readRegisteredOrMarkUnavailable(prepared, unavailable)
    if (!inventory) {
      return createEmptySpoolPublicationValidation(replaced, unavailable)
    }
    for (const entry of prepared) {
      if (
        inventory.unavailableSources.some((source) =>
          unavailableSourceAffectsTarget(source, entry.target, entry.root.scopeKey)
        )
      ) {
        addUnavailableSpoolPublication(unavailable, entry.target.instanceId, 'host-unavailable')
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
        addUnavailableSpoolPublication(unavailable, candidate.target.instanceId, reason)
      }
    }

    const registeredByInstance = new Map(
      inventory.worktrees.map(
        (target) => [spoolPublicationTargetIdentityKey(target), target] as const
      )
    )
    const overlapping = new Set<string>()
    for (const candidate of prepared) {
      const registered = registeredByInstance.get(
        spoolPublicationTargetIdentityKey(candidate.target)
      )
      if (!registered || !sameSpoolOwnerWorktreeSnapshotTarget(candidate.target, registered)) {
        addUnavailableSpoolPublication(unavailable, candidate.target.instanceId, 'ambiguous-root')
        continue
      }
      for (const entry of roots) {
        if (
          spoolPublicationTargetIdentityKey(entry.target) !==
            spoolPublicationTargetIdentityKey(candidate.target) &&
          entry.root &&
          this.incarnation.rootsOverlap(candidate.root, entry.root) &&
          !sameSpoolFolderRepoRoot(candidate.target, candidate.root, entry.target, entry.root)
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
    candidates: readonly PreparedSpoolPublication[],
    replaced: ReplacedSpoolPublication[],
    unavailable: UnavailableSpoolPublication[]
  ): Promise<PreparedSpoolPublication[]> {
    const stable: PreparedSpoolPublication[] = []
    for (const candidate of candidates) {
      const resolution = await this.incarnation.preparePublication(
        candidate.target,
        candidate.markerId
      )
      if (resolution.status === 'unavailable') {
        addUnavailableSpoolPublication(unavailable, candidate.target.instanceId, resolution.reason)
      } else if (resolution.status === 'replaced') {
        replaced.push({
          target: candidate.target,
          markerId: resolution.markerId,
          root: resolution.root
        })
      } else if (sameSpoolWorktreeRoot(candidate.root, resolution.root)) {
        stable.push(candidate)
      } else {
        // Why: a root that changed during overlap inspection was never proven
        // against the registered-root set used for this publication.
        addUnavailableSpoolPublication(unavailable, candidate.target.instanceId, 'ambiguous-root')
      }
    }
    return stable
  }

  private async readRegisteredOrMarkUnavailable(
    prepared: readonly PreparedSpoolPublication[],
    unavailable: UnavailableSpoolPublication[]
  ): Promise<SpoolOwnerWorktreeCatalogInventory | null> {
    try {
      const inventory = await this.catalog.inspectRegisteredWorktrees()
      assertSpoolWorktreeInventoryCapacity(inventory.worktrees.length)
      if (inventory.unavailableSources.length > SPOOL_PUBLICATION_MAX_REGISTERED_REPOS) {
        throw new SpoolPublicationValidationError('resource-limit')
      }
      assertUniqueSpoolPublicationTargets(inventory.worktrees)
      return captureSpoolRegisteredInventory(inventory)
    } catch (error) {
      if (isPublicationResourceLimit(error)) {
        throw error
      }
      const reason =
        (error instanceof SpoolOwnerWorktreeCatalogError && error.code === 'ambiguous') ||
        error instanceof SpoolPublicationValidationError
          ? 'ambiguous-root'
          : 'host-unavailable'
      for (const entry of prepared) {
        addUnavailableSpoolPublication(unavailable, entry.target.instanceId, reason)
      }
      return null
    }
  }

  private async resolveRegisteredRoots(
    registered: readonly SpoolOwnerWorktree[],
    prepared: readonly PreparedSpoolPublication[]
  ): Promise<readonly SpoolRegisteredRootResolution[]> {
    const preparedByTarget = new Map(
      prepared.map((entry) => [spoolPublicationTargetIdentityKey(entry.target), entry] as const)
    )
    return await mapWithConcurrency(
      registered,
      SPOOL_PUBLICATION_ROOT_RESOLUTION_CONCURRENCY,
      async (target) => {
        const candidate = preparedByTarget.get(spoolPublicationTargetIdentityKey(target))
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
