import { CoworkingExecutionError } from './execution-error'
import type {
  CoworkingHistoricalSessionCandidate,
  CoworkingHistoricalSessionConsistency,
  CoworkingPreparedHistoricalSessionConsistency,
  CoworkingSessionRootMatcher,
  CoworkingSessionWorktreeIdentity
} from './session/source'
import type {
  CoworkingOwnerWorktree,
  CoworkingRegisteredWorktreeRoot,
  CoworkingWorktreeIncarnation
} from './worktree-incarnation'
import type { CoworkingOwnerWorktreeCatalog } from './worktree-visibility'

const ROOT_RESOLUTION_CONCURRENCY = 8

export class CoworkingCanonicalHistoricalSessionConsistency implements CoworkingHistoricalSessionConsistency {
  constructor(
    private readonly worktrees: CoworkingOwnerWorktreeCatalog,
    private readonly incarnation: CoworkingWorktreeIncarnation,
    private readonly roots: CoworkingSessionRootMatcher
  ) {}

  async open(
    worktree: CoworkingSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<CoworkingPreparedHistoricalSessionConsistency> {
    signal?.throwIfAborted()
    const inventory = await this.worktrees.inspectRegisteredWorktrees()
    signal?.throwIfAborted()
    if (
      inventory.unavailableSources.some(
        (source) =>
          source.repoId === worktree.target.repoId ||
          (source.actualHostScope !== null
            ? source.actualHostScope === worktree.actualHostScope
            : source.executionHostId === worktree.target.executionHostId)
      )
    ) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    const registeredRoots = await this.resolveRegisteredRoots(inventory.worktrees, worktree, signal)
    if (!hasUniqueRegisteredTarget(worktree, registeredRoots)) {
      throw new Error('Coworking historical session target is not uniquely registered')
    }
    const matcher = this.roots.prepare({
      actualHostScope: worktree.actualHostScope,
      inventoryTarget: worktree.target,
      registeredRoots,
      binding: 'proven-target-consistency'
    })
    return {
      retainConsistent: async (candidates, readSignal) =>
        await retainConsistentCandidates(worktree, matcher, candidates, readSignal)
    }
  }

  private async resolveRegisteredRoots(
    targets: readonly CoworkingOwnerWorktree[],
    worktree: CoworkingSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<CoworkingRegisteredWorktreeRoot[]> {
    const roots: CoworkingRegisteredWorktreeRoot[] = []
    for (let index = 0; index < targets.length; index += ROOT_RESOLUTION_CONCURRENCY) {
      signal?.throwIfAborted()
      const batch = targets.slice(index, index + ROOT_RESOLUTION_CONCURRENCY)
      const resolved = await Promise.all(
        batch.map(async (target) => ({
          target,
          result: await this.incarnation.resolveRoot(target)
        }))
      )
      signal?.throwIfAborted()
      for (const entry of resolved) {
        if (entry.result.status !== 'resolved') {
          if (
            entry.result.actualHostScope === worktree.actualHostScope ||
            (!entry.result.actualHostScope &&
              entry.target.executionHostId === worktree.target.executionHostId)
          ) {
            throw new CoworkingExecutionError('resource_unavailable')
          }
          continue
        }
        if (entry.result.root.scopeKey === worktree.actualHostScope) {
          roots.push({ target: entry.target, root: entry.result.root })
        }
      }
    }
    return roots
  }
}

async function retainConsistentCandidates(
  worktree: CoworkingSessionWorktreeIdentity,
  matcher: ReturnType<CoworkingSessionRootMatcher['prepare']>,
  candidates: readonly CoworkingHistoricalSessionCandidate[],
  signal?: AbortSignal
): Promise<readonly CoworkingHistoricalSessionCandidate[]> {
  const retained = new Set<CoworkingHistoricalSessionCandidate>()
  const withCwd: { candidate: CoworkingHistoricalSessionCandidate; cwd: string }[] = []
  for (const candidate of candidates) {
    if (
      candidate.executionHostId !== worktree.target.executionHostId ||
      candidate.actualHostScope !== worktree.actualHostScope
    ) {
      continue
    }
    if (!candidate.attestationCwd) {
      // Why: durable provenance remains primary; absent CWD is not contradictory evidence.
      retained.add(candidate)
    } else {
      withCwd.push({ candidate, cwd: candidate.attestationCwd })
    }
  }
  const matches = await matcher.matchMostSpecificRoots(
    withCwd.map((entry) => entry.cwd),
    signal
  )
  signal?.throwIfAborted()
  matches.forEach((match, index) => {
    if (match?.status === 'unavailable') {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    const candidate = withCwd[index]?.candidate
    if (
      candidate &&
      match?.status === 'matched' &&
      match.worktreeId === worktree.worktreeId &&
      match.instanceId === worktree.instanceId
    ) {
      retained.add(candidate)
    }
  })
  return candidates.filter((candidate) => retained.has(candidate))
}

function hasUniqueRegisteredTarget(
  worktree: CoworkingSessionWorktreeIdentity,
  registered: readonly CoworkingRegisteredWorktreeRoot[]
): boolean {
  return (
    registered.filter(
      ({ target, root }) =>
        target.worktreeId === worktree.worktreeId &&
        target.instanceId === worktree.instanceId &&
        target.executionHostId === worktree.target.executionHostId &&
        root.scopeKey === worktree.actualHostScope
    ).length === 1
  )
}
