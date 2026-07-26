import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { CoworkingWorktreeKind } from '../../shared/coworking/worktree-kind'

export type CoworkingOwnerWorktree = {
  kind: CoworkingWorktreeKind
  worktreeId: string
  instanceId: string
  projectId: string | null
  repoId: string
  executionHostId: ExecutionHostId
  connectionId?: string | null
  projectHostSetupId?: string
  worktreePath: string
}

export function haveUniqueCoworkingWorktreeIdentities(
  targets: readonly CoworkingOwnerWorktree[]
): boolean {
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

export type CoworkingWorktreeRootComparison = {
  /** Distinguishes filesystems whose normalized path keys are not comparable. */
  scopeKey: string
  rootKey: string
  ancestorKeys: readonly string[]
}

export type CoworkingRegisteredWorktreeRoot = {
  target: CoworkingOwnerWorktree
  root: CoworkingWorktreeRootComparison
}

export type CoworkingWorktreeIncarnationUnavailableReason =
  | 'ambiguous-root'
  | 'host-unavailable'
  | 'invalid-host-response'
  | 'marker-unavailable'
  | 'not-git-worktree'

export type CoworkingHostWorktreeInspection =
  | {
      status: 'resolved'
      root: CoworkingWorktreeRootComparison
      markerId: string | null
      actualHostScope: string
    }
  | {
      status: 'unavailable'
      reason: CoworkingWorktreeIncarnationUnavailableReason
      actualHostScope?: string
    }

export type CoworkingHostWorktreeInspectionMode = 'resolve-root' | 'resolve-or-create-marker'

export type CoworkingWorktreeIncarnationHost = {
  inspect(
    target: CoworkingOwnerWorktree,
    mode: CoworkingHostWorktreeInspectionMode
  ): Promise<CoworkingHostWorktreeInspection>
}

export class CoworkingWorktreeIncarnationHostError extends Error {
  constructor(
    readonly reason: CoworkingWorktreeIncarnationUnavailableReason,
    options?: ErrorOptions
  ) {
    super(`coworking_worktree_incarnation_${reason}`, options)
    this.name = 'CoworkingWorktreeIncarnationHostError'
  }
}

export type CoworkingWorktreeRootResolution =
  | { status: 'resolved'; root: CoworkingWorktreeRootComparison }
  | {
      status: 'unavailable'
      reason: CoworkingWorktreeIncarnationUnavailableReason
      actualHostScope?: string
    }

export type CoworkingWorktreeIncarnationResolution =
  | {
      status: 'current'
      markerId: string
      root: CoworkingWorktreeRootComparison
    }
  | {
      status: 'replaced'
      markerId: string
      root: CoworkingWorktreeRootComparison
    }
  | {
      status: 'unavailable'
      reason: CoworkingWorktreeIncarnationUnavailableReason
      actualHostScope?: string
    }

/**
 * Owns marker semantics without exposing Git administration paths or platform
 * path rules to visibility callers.
 */
export class CoworkingWorktreeIncarnation {
  constructor(private readonly host: CoworkingWorktreeIncarnationHost) {}

  async preparePublication(
    target: CoworkingOwnerWorktree,
    expectedMarkerId?: string
  ): Promise<CoworkingWorktreeIncarnationResolution> {
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

  async resolveRoot(target: CoworkingOwnerWorktree): Promise<CoworkingWorktreeRootResolution> {
    const inspected = await this.inspect(target, 'resolve-root')
    return inspected.status === 'unavailable'
      ? inspected
      : { status: 'resolved', root: inspected.root }
  }

  rootsOverlap(
    left: CoworkingWorktreeRootComparison,
    right: CoworkingWorktreeRootComparison
  ): boolean {
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
    target: CoworkingOwnerWorktree,
    mode: CoworkingHostWorktreeInspectionMode
  ): Promise<CoworkingHostWorktreeInspection> {
    let inspected: CoworkingHostWorktreeInspection
    try {
      inspected = await this.host.inspect(target, mode)
    } catch (error) {
      // Why: an unknown host failure cannot be distinguished safely from an
      // unreadable or replaced worktree, so publication remains unavailable.
      return {
        status: 'unavailable',
        reason:
          error instanceof CoworkingWorktreeIncarnationHostError ? error.reason : 'host-unavailable'
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

function cloneValidRoot(
  root: CoworkingWorktreeRootComparison
): CoworkingWorktreeRootComparison | null {
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
