import { isValidSpoolCanonicalPath } from './spool-canonical-host-path'
import type {
  SpoolCanonicalHostPathResult,
  SpoolActualHostWorktreeIncarnationHost
} from './spool-worktree-incarnation-host'
import type { SpoolOwnerWorktree, SpoolRegisteredWorktreeRoot } from './spool-worktree-incarnation'
import type {
  SpoolPreparedSessionRootMatcher,
  SpoolSessionRootMatch,
  SpoolSessionRootMatcher
} from './spool-session-source'

const CWD_CANONICALIZATION_CONCURRENCY = 8

type CanonicalPathResolver = Pick<SpoolActualHostWorktreeIncarnationHost, 'canonicalizePath'>
type RootIndex = Map<string, Map<string, SpoolRegisteredWorktreeRoot[]>>

/** Indexes registered roots once, then canonicalizes each candidate only on its inventory host. */
export class SpoolActualHostSessionRootMatcher implements SpoolSessionRootMatcher {
  constructor(private readonly paths: CanonicalPathResolver) {}

  prepare(args: {
    actualHostScope: string
    inventoryTarget: SpoolOwnerWorktree
    registeredRoots: readonly SpoolRegisteredWorktreeRoot[]
  }): SpoolPreparedSessionRootMatcher {
    const roots = args.registeredRoots.filter(
      (entry) => entry.root.scopeKey === args.actualHostScope
    )
    const valid =
      Boolean(args.actualHostScope.trim()) &&
      haveUniqueIdentities(roots) &&
      roots.filter((entry) => sameTarget(entry.target, args.inventoryTarget)).length === 1 &&
      roots.every((entry) => isValidSpoolCanonicalPath(entry.root))
    const index = valid ? indexRoots(roots) : new Map()
    return {
      matchMostSpecificRoots: async (cwds, signal) =>
        valid
          ? await matchCandidateRoots(this.paths, args.inventoryTarget, index, cwds, signal)
          : cwds.map(() => ({ status: 'ambiguous' as const }))
    }
  }
}

async function matchCandidateRoots(
  paths: CanonicalPathResolver,
  inventoryTarget: SpoolOwnerWorktree,
  roots: RootIndex,
  cwds: readonly string[],
  signal?: AbortSignal
): Promise<SpoolSessionRootMatch[]> {
  const uniqueCwds = [...new Set(cwds)]
  const resolvedByCwd = new Map<string, SpoolCanonicalHostPathResult>()
  for (let index = 0; index < uniqueCwds.length; index += CWD_CANONICALIZATION_CONCURRENCY) {
    signal?.throwIfAborted()
    const batch = uniqueCwds.slice(index, index + CWD_CANONICALIZATION_CONCURRENCY)
    const resolved = await Promise.all(
      batch.map(async (cwd) => await paths.canonicalizePath(inventoryTarget, cwd))
    )
    signal?.throwIfAborted()
    batch.forEach((cwd, offset) => {
      const result = resolved[offset]
      if (result) {
        resolvedByCwd.set(cwd, result)
      }
    })
  }
  return cwds.map((cwd) => matchCanonicalCandidate(resolvedByCwd.get(cwd), roots))
}

function matchCanonicalCandidate(
  candidate: SpoolCanonicalHostPathResult | undefined,
  roots: RootIndex
): SpoolSessionRootMatch {
  if (!candidate || candidate.status === 'unavailable') {
    return { status: 'unavailable' }
  }
  if (candidate.status === 'missing') {
    return { status: 'unmatched' }
  }
  const rootsByPath = roots.get(candidate.path.scopeKey)
  if (!rootsByPath) {
    return { status: 'unmatched' }
  }
  for (const pathKey of [candidate.path.rootKey, ...candidate.path.ancestorKeys]) {
    const matches = rootsByPath.get(pathKey)
    if (!matches) {
      continue
    }
    if (matches.length !== 1) {
      return { status: 'ambiguous' }
    }
    const [match] = matches
    return match
      ? {
          status: 'matched',
          worktreeId: match.target.worktreeId,
          instanceId: match.target.instanceId
        }
      : { status: 'ambiguous' }
  }
  return { status: 'unmatched' }
}

function indexRoots(roots: readonly SpoolRegisteredWorktreeRoot[]): RootIndex {
  const index: RootIndex = new Map()
  for (const root of roots) {
    const byPath = index.get(root.root.scopeKey) ?? new Map()
    const matches = byPath.get(root.root.rootKey) ?? []
    matches.push(root)
    byPath.set(root.root.rootKey, matches)
    index.set(root.root.scopeKey, byPath)
  }
  return index
}

function haveUniqueIdentities(roots: readonly SpoolRegisteredWorktreeRoot[]): boolean {
  const worktreeIds = new Set<string>()
  const instanceIds = new Set<string>()
  for (const { target } of roots) {
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

function sameTarget(left: SpoolOwnerWorktree, right: SpoolOwnerWorktree): boolean {
  return left.worktreeId === right.worktreeId && left.instanceId === right.instanceId
}
