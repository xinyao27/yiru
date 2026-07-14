import type { ExecutionHostId } from '../../shared/execution-host'
import type { SpoolSessionRootMatch, SpoolSessionRootMatcher } from './spool-session-source'
import type {
  SpoolCanonicalHostPathResult,
  SpoolActualHostWorktreeIncarnationHost
} from './spool-worktree-incarnation-host'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'

type CanonicalPathResolver = Pick<SpoolActualHostWorktreeIncarnationHost, 'canonicalizePath'>

type MatchedRoot = {
  target: SpoolOwnerWorktree
  depth: number
  rootKey: string
}

/** Selects the deepest registered root using canonical paths from the owning host. */
export class SpoolActualHostSessionRootMatcher implements SpoolSessionRootMatcher {
  constructor(private readonly paths: CanonicalPathResolver) {}

  async matchMostSpecificRoot(args: {
    executionHostId: ExecutionHostId
    cwd: string
    registeredWorktrees: readonly SpoolOwnerWorktree[]
  }): Promise<SpoolSessionRootMatch> {
    const candidates = args.registeredWorktrees.filter(
      (target) => target.executionHostId === args.executionHostId
    )
    if (!args.cwd.trim() || candidates.length === 0) {
      return { status: 'unmatched' }
    }
    if (!haveUniqueIdentities(candidates)) {
      return { status: 'ambiguous' }
    }
    const resolved = await Promise.all(
      candidates.map((target) => this.matchTarget(target, args.cwd))
    )
    if (resolved.some((entry) => entry.status === 'unavailable')) {
      // Why: an unknown registered root could be more specific than a visible candidate.
      return { status: 'unavailable' }
    }
    const matches = resolved.flatMap((entry) => (entry.status === 'matched' ? [entry.match] : []))
    if (matches.length === 0) {
      return { status: 'unmatched' }
    }
    const greatestDepth = Math.max(...matches.map((match) => match.depth))
    const mostSpecific = matches.filter((match) => match.depth === greatestDepth)
    if (mostSpecific.length !== 1 || haveDuplicateCanonicalRoot(matches)) {
      return { status: 'ambiguous' }
    }
    const [match] = mostSpecific
    return match
      ? {
          status: 'matched',
          worktreeId: match.target.worktreeId,
          instanceId: match.target.instanceId
        }
      : { status: 'unavailable' }
  }

  private async matchTarget(
    target: SpoolOwnerWorktree,
    cwd: string
  ): Promise<
    { status: 'matched'; match: MatchedRoot } | { status: 'unmatched' } | { status: 'unavailable' }
  > {
    const [root, candidate] = await Promise.all([
      this.paths.canonicalizePath(target, target.worktreePath),
      this.paths.canonicalizePath(target, cwd)
    ])
    if (root.status !== 'resolved') {
      return { status: 'unavailable' }
    }
    if (candidate.status === 'unavailable') {
      return { status: 'unavailable' }
    }
    if (candidate.status === 'missing' || !containsCanonicalPath(root, candidate)) {
      return { status: 'unmatched' }
    }
    return {
      status: 'matched',
      match: {
        target,
        depth: root.path.ancestorKeys.length,
        rootKey: root.path.rootKey
      }
    }
  }
}

function containsCanonicalPath(
  root: Extract<SpoolCanonicalHostPathResult, { status: 'resolved' }>,
  candidate: Extract<SpoolCanonicalHostPathResult, { status: 'resolved' }>
): boolean {
  return (
    root.path.scopeKey === candidate.path.scopeKey &&
    (root.path.rootKey === candidate.path.rootKey ||
      candidate.path.ancestorKeys.includes(root.path.rootKey))
  )
}

function haveUniqueIdentities(targets: readonly SpoolOwnerWorktree[]): boolean {
  const worktreeIds = new Set<string>()
  const instanceIds = new Set<string>()
  for (const target of targets) {
    if (
      !target.worktreeId ||
      !target.instanceId ||
      worktreeIds.has(target.worktreeId) ||
      instanceIds.has(target.instanceId)
    ) {
      return false
    }
    worktreeIds.add(target.worktreeId)
    instanceIds.add(target.instanceId)
  }
  return true
}

function haveDuplicateCanonicalRoot(matches: readonly MatchedRoot[]): boolean {
  const roots = new Set<string>()
  for (const match of matches) {
    if (roots.has(match.rootKey)) {
      return true
    }
    roots.add(match.rootKey)
  }
  return false
}
