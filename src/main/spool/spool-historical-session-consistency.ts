import type {
  SpoolHistoricalSessionCandidate,
  SpoolHistoricalSessionConsistency,
  SpoolSessionRootMatcher,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import type { SpoolOwnerWorktreeCatalog } from './spool-worktree-visibility'

export class SpoolCanonicalHistoricalSessionConsistency implements SpoolHistoricalSessionConsistency {
  constructor(
    private readonly worktrees: SpoolOwnerWorktreeCatalog,
    private readonly roots: SpoolSessionRootMatcher
  ) {}

  async retainConsistent(
    worktree: SpoolSessionWorktreeIdentity,
    candidates: readonly SpoolHistoricalSessionCandidate[]
  ): Promise<readonly SpoolHistoricalSessionCandidate[]> {
    if (candidates.length === 0) {
      return []
    }
    const inventory = await this.worktrees.inspectRegisteredWorktrees()
    if (inventory.unavailableExecutionHostIds.includes(worktree.target.executionHostId)) {
      return []
    }
    const registered = [...inventory.worktrees]
    if (!hasUniqueRegisteredTarget(worktree, registered)) {
      return []
    }
    const consistency = await Promise.all(
      candidates.map((candidate) => this.isConsistent(worktree, candidate, registered))
    )
    return candidates.filter((_candidate, index) => consistency[index] === true)
  }

  private async isConsistent(
    worktree: SpoolSessionWorktreeIdentity,
    candidate: SpoolHistoricalSessionCandidate,
    registered: readonly SpoolOwnerWorktree[]
  ): Promise<boolean> {
    if (candidate.executionHostId !== worktree.target.executionHostId) {
      return false
    }
    if (!candidate.attestationCwd) {
      // Why: durable provenance remains primary; absent CWD is not contradictory evidence.
      return true
    }
    const matched = await this.roots.matchMostSpecificRoot({
      executionHostId: candidate.executionHostId,
      cwd: candidate.attestationCwd,
      registeredWorktrees: registered
    })
    return (
      matched.status === 'matched' &&
      matched.worktreeId === worktree.worktreeId &&
      matched.instanceId === worktree.instanceId
    )
  }
}

function hasUniqueRegisteredTarget(
  worktree: SpoolSessionWorktreeIdentity,
  registered: readonly SpoolOwnerWorktree[]
): boolean {
  return (
    registered.filter(
      (target) =>
        target.worktreeId === worktree.worktreeId &&
        target.instanceId === worktree.instanceId &&
        target.executionHostId === worktree.target.executionHostId
    ).length === 1
  )
}
