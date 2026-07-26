import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'

import type {
  CoworkingLiveSessionCandidate,
  CoworkingSessionWorktreeIdentity
} from './session-source'
import type { CoworkingPublicWorktreeInstance } from './worktree-visibility'

export function toSessionWorktree(
  instance: CoworkingPublicWorktreeInstance
): CoworkingSessionWorktreeIdentity {
  return {
    worktreeId: instance.worktreeId,
    instanceId: instance.instanceId,
    coworkingIncarnationId: instance.coworkingIncarnationId,
    actualHostScope: instance.actualHostScope,
    target: instance.ownerWorktree
  }
}

export function sessionChainBindingKey(
  worktree: CoworkingSessionWorktreeIdentity,
  inventoryScope: string
): string {
  return JSON.stringify([
    worktree.worktreeId,
    worktree.instanceId,
    worktree.coworkingIncarnationId,
    worktree.target.kind,
    worktree.actualHostScope,
    worktree.target.executionHostId,
    worktree.target.worktreePath,
    inventoryScope
  ])
}

export function requireInventoryScope(value: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error('Invalid Coworking session inventory scope')
  }
}

export function hasExactLiveBinding(
  worktree: CoworkingSessionWorktreeIdentity,
  candidate: CoworkingLiveSessionCandidate
): boolean {
  return (
    candidate.executionHostId === worktree.target.executionHostId &&
    candidate.actualHostScope === worktree.actualHostScope &&
    candidate.worktreeInstanceId === worktree.instanceId &&
    candidate.coworkingIncarnationId === worktree.coworkingIncarnationId &&
    candidate.terminalHandle.length > 0 &&
    candidate.terminalHandle.length <= 2048
  )
}

export function requireExactWorktreeIdentity(worktree: CoworkingSessionWorktreeIdentity): void {
  if (
    worktree.target.worktreeId !== worktree.worktreeId ||
    worktree.target.instanceId !== worktree.instanceId ||
    worktree.target.executionHostId !== normalizeExecutionHostId(worktree.target.executionHostId) ||
    !worktree.actualHostScope.trim() ||
    !worktree.coworkingIncarnationId.trim()
  ) {
    throw new Error('Invalid Coworking session worktree identity')
  }
}
