import type { ExecutionHostId } from '../../shared/execution-host'
import type {
  SpoolWorktreeIncarnation,
  SpoolOwnerWorktree,
  SpoolWorktreeIncarnationUnavailableReason,
  SpoolWorktreeRootComparison
} from './spool-worktree-incarnation'
import { haveUniqueSpoolWorktreeIdentities } from './spool-worktree-incarnation'

export type SpoolOwnerWorktreeCatalogInventory = {
  worktrees: readonly SpoolOwnerWorktree[]
  unavailableExecutionHostIds: readonly ExecutionHostId[]
}

export type SpoolOwnerWorktreeCatalog = {
  getWorktree(worktreeId: string): Promise<SpoolOwnerWorktree | null>
  getWorktreeByInstance(instanceId: string): Promise<SpoolOwnerWorktree | null>
  listProjectWorktrees(projectId: string): Promise<readonly SpoolOwnerWorktree[]>
  inspectRegisteredWorktrees(): Promise<SpoolOwnerWorktreeCatalogInventory>
}

export class SpoolOwnerWorktreeCatalogError extends Error {
  constructor(readonly code: 'ambiguous' | 'unavailable') {
    super(`spool_worktree_catalog_${code}`)
    this.name = 'SpoolOwnerWorktreeCatalogError'
  }
}

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

export type UnavailableSpoolPublication = {
  instanceId: string
  reason: SpoolWorktreeIncarnationUnavailableReason
}

export type SpoolPublicationValidation = {
  ready: readonly PreparedSpoolPublication[]
  replaced: readonly ReplacedSpoolPublication[]
  unavailable: readonly UnavailableSpoolPublication[]
  overlappingInstanceIds: readonly string[]
}

export class SpoolPublicationValidationError extends Error {
  constructor(readonly code: 'invalid-catalog') {
    super(`spool_publication_${code}`)
    this.name = 'SpoolPublicationValidationError'
  }
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
    assertUniqueTargets(candidates.map((candidate) => candidate.target))
    const resolutions = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        resolution: await this.incarnation.preparePublication(
          candidate.target,
          candidate.expectedMarkerId
        )
      }))
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
        // Why: persisted Public metadata without its marker cannot prove which
        // path incarnation the owner originally published, even if a new marker was created.
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
      return { ready: [], replaced, unavailable, overlappingInstanceIds: [] }
    }

    const inventory = await this.readRegisteredOrMarkUnavailable(prepared, unavailable)
    if (!inventory) {
      return { ready: [], replaced, unavailable, overlappingInstanceIds: [] }
    }
    const unavailableHosts = new Set(inventory.unavailableExecutionHostIds)
    for (const entry of prepared) {
      if (unavailableHosts.has(entry.target.executionHostId)) {
        addUnavailable(unavailable, entry.target.instanceId, 'host-unavailable')
      }
    }
    const roots = await this.resolveRegisteredRoots(inventory.worktrees, prepared)
    for (const unresolved of roots.filter((entry) => entry.root === null)) {
      for (const candidate of prepared) {
        if (candidate.target.executionHostId === unresolved.target.executionHostId) {
          // Why: an unknown root can overlap only roots on its actual execution host.
          addUnavailable(
            unavailable,
            candidate.target.instanceId,
            unresolved.reason ?? 'ambiguous-root'
          )
        }
      }
    }

    const registeredInstances = new Set(inventory.worktrees.map(targetIdentityKey))
    const overlapping = new Set<string>()
    for (const candidate of prepared) {
      if (!registeredInstances.has(targetIdentityKey(candidate.target))) {
        addUnavailable(unavailable, candidate.target.instanceId, 'ambiguous-root')
        continue
      }
      for (const entry of roots) {
        if (
          targetIdentityKey(entry.target) !== targetIdentityKey(candidate.target) &&
          entry.root &&
          this.incarnation.rootsOverlap(candidate.root, entry.root)
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
        addUnavailable(unavailable, candidate.target.instanceId, resolution.reason)
      } else if (resolution.status === 'replaced') {
        replaced.push({
          target: candidate.target,
          markerId: resolution.markerId,
          root: resolution.root
        })
      } else if (rootsEqual(candidate.root, resolution.root)) {
        stable.push(candidate)
      } else {
        // Why: a root that changed during overlap inspection was never proven
        // against the registered-root set used for this publication.
        addUnavailable(unavailable, candidate.target.instanceId, 'ambiguous-root')
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
      assertUniqueTargets(inventory.worktrees)
      return inventory
    } catch (error) {
      const reason =
        (error instanceof SpoolOwnerWorktreeCatalogError && error.code === 'ambiguous') ||
        error instanceof SpoolPublicationValidationError
          ? 'ambiguous-root'
          : 'host-unavailable'
      for (const entry of prepared) {
        addUnavailable(unavailable, entry.target.instanceId, reason)
      }
      return null
    }
  }

  private async resolveRegisteredRoots(
    registered: readonly SpoolOwnerWorktree[],
    prepared: readonly PreparedSpoolPublication[]
  ): Promise<
    readonly {
      target: SpoolOwnerWorktree
      root: SpoolWorktreeRootComparison | null
      reason?: SpoolWorktreeIncarnationUnavailableReason
    }[]
  > {
    const preparedByTarget = new Map(
      prepared.map((entry) => [targetIdentityKey(entry.target), entry] as const)
    )
    return await Promise.all(
      registered.map(async (target) => {
        const candidate = preparedByTarget.get(targetIdentityKey(target))
        if (candidate) {
          return { target, root: candidate.root }
        }
        const resolved = await this.incarnation.resolveRoot(target)
        return resolved.status === 'resolved'
          ? { target, root: resolved.root }
          : { target, root: null, reason: resolved.reason }
      })
    )
  }
}

function assertUniqueTargets(targets: readonly SpoolOwnerWorktree[]): void {
  if (!haveUniqueSpoolWorktreeIdentities(targets)) {
    throw new SpoolPublicationValidationError('invalid-catalog')
  }
}

function addUnavailable(
  unavailable: UnavailableSpoolPublication[],
  instanceId: string,
  reason: SpoolWorktreeIncarnationUnavailableReason
): void {
  if (!unavailable.some((entry) => entry.instanceId === instanceId)) {
    unavailable.push({ instanceId, reason })
  }
}

function targetIdentityKey(target: SpoolOwnerWorktree): string {
  return `${target.worktreeId}\0${target.instanceId}`
}

function rootsEqual(
  left: SpoolWorktreeRootComparison,
  right: SpoolWorktreeRootComparison
): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    left.rootKey === right.rootKey &&
    left.ancestorKeys.length === right.ancestorKeys.length &&
    left.ancestorKeys.every((key, index) => key === right.ancestorKeys[index])
  )
}
