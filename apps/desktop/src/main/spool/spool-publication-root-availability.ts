import type { ExecutionHostId } from '../../shared/execution-host'
import type { SpoolUnavailableCatalogSource } from './spool-owner-worktree-catalog-contract'
import type {
  SpoolOwnerWorktree,
  SpoolWorktreeIncarnationUnavailableReason,
  SpoolWorktreeRootComparison
} from './spool-worktree-incarnation'

export type SpoolRegisteredRootResolution = {
  target: SpoolOwnerWorktree
  root: SpoolWorktreeRootComparison | null
  reason?: SpoolWorktreeIncarnationUnavailableReason
  actualHostScope?: string
}

export function unresolvedRegisteredRootReason(
  executionHostId: ExecutionHostId,
  actualHostScope: string,
  roots: readonly SpoolRegisteredRootResolution[]
): SpoolWorktreeIncarnationUnavailableReason | null {
  let unknownRouteReason: SpoolWorktreeIncarnationUnavailableReason | null = null
  for (const entry of roots) {
    if (entry.root) {
      continue
    }
    const reason = entry.reason ?? 'ambiguous-root'
    if (entry.actualHostScope === actualHostScope) {
      return reason
    }
    if (!entry.actualHostScope && entry.target.executionHostId === executionHostId) {
      // Why: without an inner scope, fail closed across the outer route that could contain it.
      unknownRouteReason ??= reason
    }
  }
  return unknownRouteReason
}

export function unavailableSourceAffectsTarget(
  source: SpoolUnavailableCatalogSource,
  target: SpoolOwnerWorktree,
  actualHostScope: string
): boolean {
  return (
    source.repoId === target.repoId ||
    (source.actualHostScope !== null
      ? source.actualHostScope === actualHostScope
      : source.executionHostId === target.executionHostId)
  )
}

export function sameSpoolWorktreeRoot(
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

export function sameSpoolFolderRepoRoot(
  leftTarget: SpoolOwnerWorktree,
  leftRoot: SpoolWorktreeRootComparison,
  rightTarget: SpoolOwnerWorktree,
  rightRoot: SpoolWorktreeRootComparison
): boolean {
  // Why: synthetic workspaces of one folder repo share files while retaining instance-bound sessions.
  return (
    leftTarget.kind === 'folder' &&
    rightTarget.kind === 'folder' &&
    leftTarget.repoId === rightTarget.repoId &&
    sameSpoolWorktreeRoot(leftRoot, rightRoot)
  )
}
