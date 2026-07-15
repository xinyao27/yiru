import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolHistoricalSessionCandidate,
  SpoolHistoricalSessionConsistency,
  SpoolPreparedHistoricalSessionConsistency,
  SpoolSessionRootMatcher,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type {
  SpoolOwnerWorktree,
  SpoolRegisteredWorktreeRoot,
  SpoolWorktreeIncarnation
} from './spool-worktree-incarnation'
import type { SpoolOwnerWorktreeCatalog } from './spool-worktree-visibility'

const ROOT_RESOLUTION_CONCURRENCY = 8

export class SpoolCanonicalHistoricalSessionConsistency implements SpoolHistoricalSessionConsistency {
  constructor(
    private readonly worktrees: SpoolOwnerWorktreeCatalog,
    private readonly incarnation: SpoolWorktreeIncarnation,
    private readonly roots: SpoolSessionRootMatcher
  ) {}

  async open(
    worktree: SpoolSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<SpoolPreparedHistoricalSessionConsistency> {
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
      throw new SpoolExecutionError('resource_unavailable')
    }
    const registeredRoots = await this.resolveRegisteredRoots(inventory.worktrees, worktree, signal)
    if (!hasUniqueRegisteredTarget(worktree, registeredRoots)) {
      throw new Error('Spool historical session target is not uniquely registered')
    }
    const matcher = this.roots.prepare({
      actualHostScope: worktree.actualHostScope,
      inventoryTarget: worktree.target,
      registeredRoots
    })
    return {
      retainConsistent: async (candidates, readSignal) =>
        await retainConsistentCandidates(worktree, matcher, candidates, readSignal)
    }
  }

  private async resolveRegisteredRoots(
    targets: readonly SpoolOwnerWorktree[],
    worktree: SpoolSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<SpoolRegisteredWorktreeRoot[]> {
    const roots: SpoolRegisteredWorktreeRoot[] = []
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
            throw new SpoolExecutionError('resource_unavailable')
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
  worktree: SpoolSessionWorktreeIdentity,
  matcher: ReturnType<SpoolSessionRootMatcher['prepare']>,
  candidates: readonly SpoolHistoricalSessionCandidate[],
  signal?: AbortSignal
): Promise<readonly SpoolHistoricalSessionCandidate[]> {
  const retained = new Set<SpoolHistoricalSessionCandidate>()
  const withCwd: { candidate: SpoolHistoricalSessionCandidate; cwd: string }[] = []
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
      throw new SpoolExecutionError('resource_unavailable')
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
  worktree: SpoolSessionWorktreeIdentity,
  registered: readonly SpoolRegisteredWorktreeRoot[]
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
