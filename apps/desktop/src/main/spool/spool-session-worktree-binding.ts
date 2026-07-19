import { normalizeExecutionHostId } from '../../shared/execution-host'
import type {
  SpoolLiveSessionCandidate,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

export function toSessionWorktree(
  instance: SpoolPublicWorktreeInstance
): SpoolSessionWorktreeIdentity {
  return {
    worktreeId: instance.worktreeId,
    instanceId: instance.instanceId,
    spoolIncarnationId: instance.spoolIncarnationId,
    actualHostScope: instance.actualHostScope,
    target: instance.ownerWorktree
  }
}

export function sessionChainBindingKey(
  worktree: SpoolSessionWorktreeIdentity,
  inventoryScope: string
): string {
  return JSON.stringify([
    worktree.worktreeId,
    worktree.instanceId,
    worktree.spoolIncarnationId,
    worktree.target.kind,
    worktree.actualHostScope,
    worktree.target.executionHostId,
    worktree.target.worktreePath,
    inventoryScope
  ])
}

export function requireInventoryScope(value: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error('Invalid Spool session inventory scope')
  }
}

export function hasExactLiveBinding(
  worktree: SpoolSessionWorktreeIdentity,
  candidate: SpoolLiveSessionCandidate
): boolean {
  return (
    candidate.executionHostId === worktree.target.executionHostId &&
    candidate.actualHostScope === worktree.actualHostScope &&
    candidate.worktreeInstanceId === worktree.instanceId &&
    candidate.spoolIncarnationId === worktree.spoolIncarnationId &&
    candidate.terminalHandle.length > 0 &&
    candidate.terminalHandle.length <= 2048
  )
}

export function requireExactWorktreeIdentity(worktree: SpoolSessionWorktreeIdentity): void {
  if (
    worktree.target.worktreeId !== worktree.worktreeId ||
    worktree.target.instanceId !== worktree.instanceId ||
    worktree.target.executionHostId !== normalizeExecutionHostId(worktree.target.executionHostId) ||
    !worktree.actualHostScope.trim() ||
    !worktree.spoolIncarnationId.trim()
  ) {
    throw new Error('Invalid Spool session worktree identity')
  }
}
