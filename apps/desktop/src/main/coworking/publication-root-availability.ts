import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { CoworkingUnavailableCatalogSource } from './owner-worktree-catalog-contract'
import type {
  CoworkingOwnerWorktree,
  CoworkingWorktreeIncarnationUnavailableReason,
  CoworkingWorktreeRootComparison
} from './worktree-incarnation'

export type CoworkingRegisteredRootResolution = {
  target: CoworkingOwnerWorktree
  root: CoworkingWorktreeRootComparison | null
  reason?: CoworkingWorktreeIncarnationUnavailableReason
  actualHostScope?: string
}

export function unresolvedRegisteredRootReason(
  executionHostId: ExecutionHostId,
  actualHostScope: string,
  roots: readonly CoworkingRegisteredRootResolution[]
): CoworkingWorktreeIncarnationUnavailableReason | null {
  let unknownRouteReason: CoworkingWorktreeIncarnationUnavailableReason | null = null
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
  source: CoworkingUnavailableCatalogSource,
  target: CoworkingOwnerWorktree,
  actualHostScope: string
): boolean {
  return (
    source.repoId === target.repoId ||
    (source.actualHostScope !== null
      ? source.actualHostScope === actualHostScope
      : source.executionHostId === target.executionHostId)
  )
}

export function sameCoworkingWorktreeRoot(
  left: CoworkingWorktreeRootComparison,
  right: CoworkingWorktreeRootComparison
): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    left.rootKey === right.rootKey &&
    left.ancestorKeys.length === right.ancestorKeys.length &&
    left.ancestorKeys.every((key, index) => key === right.ancestorKeys[index])
  )
}

export function sameCoworkingFolderRepoRoot(
  leftTarget: CoworkingOwnerWorktree,
  leftRoot: CoworkingWorktreeRootComparison,
  rightTarget: CoworkingOwnerWorktree,
  rightRoot: CoworkingWorktreeRootComparison
): boolean {
  // Why: synthetic workspaces of one folder repo share files while retaining instance-bound sessions.
  return (
    leftTarget.kind === 'folder' &&
    rightTarget.kind === 'folder' &&
    leftTarget.repoId === rightTarget.repoId &&
    sameCoworkingWorktreeRoot(leftRoot, rightRoot)
  )
}
