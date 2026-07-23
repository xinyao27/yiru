import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { SpoolWorktreeKind } from '../../shared/spool/spool-worktree-kind'

export type SpoolOwnerWorktree = {
  kind: SpoolWorktreeKind
  worktreeId: string
  instanceId: string
  projectId: string | null
  repoId: string
  executionHostId: ExecutionHostId
  connectionId?: string | null
  projectHostSetupId?: string
  worktreePath: string
}

export function haveUniqueSpoolWorktreeIdentities(targets: readonly SpoolOwnerWorktree[]): boolean {
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

export type SpoolWorktreeRootComparison = {
  /** Distinguishes filesystems whose normalized path keys are not comparable. */
  scopeKey: string
  rootKey: string
  ancestorKeys: readonly string[]
}

export type SpoolRegisteredWorktreeRoot = {
  target: SpoolOwnerWorktree
  root: SpoolWorktreeRootComparison
}

export type SpoolWorktreeIncarnationUnavailableReason =
  | 'ambiguous-root'
  | 'host-unavailable'
  | 'invalid-host-response'
  | 'marker-unavailable'
  | 'not-git-worktree'

export type SpoolHostWorktreeInspection =
  | {
      status: 'resolved'
      root: SpoolWorktreeRootComparison
      markerId: string | null
      actualHostScope: string
    }
  | {
      status: 'unavailable'
      reason: SpoolWorktreeIncarnationUnavailableReason
      actualHostScope?: string
    }

export type SpoolHostWorktreeInspectionMode = 'resolve-root' | 'resolve-or-create-marker'

export type SpoolWorktreeIncarnationHost = {
  inspect(
    target: SpoolOwnerWorktree,
    mode: SpoolHostWorktreeInspectionMode
  ): Promise<SpoolHostWorktreeInspection>
}

export class SpoolWorktreeIncarnationHostError extends Error {
  constructor(
    readonly reason: SpoolWorktreeIncarnationUnavailableReason,
    options?: ErrorOptions
  ) {
    super(`spool_worktree_incarnation_${reason}`, options)
    this.name = 'SpoolWorktreeIncarnationHostError'
  }
}

export type SpoolWorktreeRootResolution =
  | { status: 'resolved'; root: SpoolWorktreeRootComparison }
  | {
      status: 'unavailable'
      reason: SpoolWorktreeIncarnationUnavailableReason
      actualHostScope?: string
    }

export type SpoolWorktreeIncarnationResolution =
  | {
      status: 'current'
      markerId: string
      root: SpoolWorktreeRootComparison
    }
  | {
      status: 'replaced'
      markerId: string
      root: SpoolWorktreeRootComparison
    }
  | {
      status: 'unavailable'
      reason: SpoolWorktreeIncarnationUnavailableReason
      actualHostScope?: string
    }

/**
 * Owns marker semantics without exposing Git administration paths or platform
 * path rules to visibility callers.
 */
export class SpoolWorktreeIncarnation {
  constructor(private readonly host: SpoolWorktreeIncarnationHost) {}

  async preparePublication(
    target: SpoolOwnerWorktree,
    expectedMarkerId?: string
  ): Promise<SpoolWorktreeIncarnationResolution> {
    const inspected = await this.inspect(target, 'resolve-or-create-marker')
    if (inspected.status === 'unavailable') {
      return inspected
    }
    if (!inspected.markerId) {
      return {
        status: 'unavailable',
        reason: 'marker-unavailable',
        actualHostScope: inspected.actualHostScope
      }
    }
    // Why: the marker is bound to durable host evidence, so a change proves
    // that this path no longer names the instance the owner attested.
    if (expectedMarkerId && inspected.markerId !== expectedMarkerId) {
      return { status: 'replaced', markerId: inspected.markerId, root: inspected.root }
    }
    return { status: 'current', markerId: inspected.markerId, root: inspected.root }
  }

  async resolveRoot(target: SpoolOwnerWorktree): Promise<SpoolWorktreeRootResolution> {
    const inspected = await this.inspect(target, 'resolve-root')
    return inspected.status === 'unavailable'
      ? inspected
      : { status: 'resolved', root: inspected.root }
  }

  rootsOverlap(left: SpoolWorktreeRootComparison, right: SpoolWorktreeRootComparison): boolean {
    if (left.scopeKey !== right.scopeKey) {
      return false
    }
    return (
      left.rootKey === right.rootKey ||
      left.ancestorKeys.includes(right.rootKey) ||
      right.ancestorKeys.includes(left.rootKey)
    )
  }

  private async inspect(
    target: SpoolOwnerWorktree,
    mode: SpoolHostWorktreeInspectionMode
  ): Promise<SpoolHostWorktreeInspection> {
    let inspected: SpoolHostWorktreeInspection
    try {
      inspected = await this.host.inspect(target, mode)
    } catch (error) {
      // Why: an unknown host failure cannot be distinguished safely from an
      // unreadable or replaced worktree, so publication remains unavailable.
      return {
        status: 'unavailable',
        reason:
          error instanceof SpoolWorktreeIncarnationHostError ? error.reason : 'host-unavailable'
      }
    }
    if (inspected.status === 'unavailable') {
      return inspected
    }
    const root = cloneValidRoot(inspected.root)
    const markerId = inspected.markerId
    if (
      !root ||
      root.scopeKey !== inspected.actualHostScope ||
      (markerId !== null && !markerId.trim())
    ) {
      return {
        status: 'unavailable',
        reason: 'invalid-host-response',
        actualHostScope: inspected.actualHostScope
      }
    }
    return { status: 'resolved', root, markerId, actualHostScope: inspected.actualHostScope }
  }
}

function cloneValidRoot(root: SpoolWorktreeRootComparison): SpoolWorktreeRootComparison | null {
  if (!root.scopeKey?.trim() || !root.rootKey?.trim() || !Array.isArray(root.ancestorKeys)) {
    return null
  }
  const ancestorKeys: string[] = []
  const seen = new Set<string>()
  for (const key of root.ancestorKeys) {
    if (typeof key !== 'string' || !key.trim()) {
      return null
    }
    if (!seen.has(key)) {
      seen.add(key)
      ancestorKeys.push(key)
    }
  }
  return { scopeKey: root.scopeKey, rootKey: root.rootKey, ancestorKeys }
}
