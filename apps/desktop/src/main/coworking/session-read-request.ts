import type {
  CoworkingExecutionHostSessionReadRequest,
  CoworkingHistoricalSessionPurpose,
  CoworkingSessionWorktreeIdentity
} from './session-source'

// Why: catalog reads use a fixed, non-secret inventory scope — live tabs have
// no per-request scope of their own, unlike paged historical reads.
export const LIVE_SESSION_INVENTORY_SCOPE = '00000000-0000-4000-8000-000000000000'

// Why: only a route rename preserves session identity; reusing an instance id
// under a different incarnation or host must be treated as a new worktree.
export function isSameSessionIdentityScope(
  left: Pick<
    CoworkingSessionWorktreeIdentity,
    'instanceId' | 'coworkingIncarnationId' | 'actualHostScope'
  >,
  right: Pick<
    CoworkingSessionWorktreeIdentity,
    'instanceId' | 'coworkingIncarnationId' | 'actualHostScope'
  >
): boolean {
  return (
    left.instanceId === right.instanceId &&
    left.coworkingIncarnationId === right.coworkingIncarnationId &&
    left.actualHostScope === right.actualHostScope
  )
}

export function liveSessionReadRequest(
  worktree: CoworkingSessionWorktreeIdentity
): CoworkingExecutionHostSessionReadRequest {
  return toReadRequest(worktree, 'catalog', LIVE_SESSION_INVENTORY_SCOPE, null)
}

export function toReadRequest(
  worktree: CoworkingSessionWorktreeIdentity,
  purpose: CoworkingHistoricalSessionPurpose,
  inventoryScope: string,
  localWslDistro: string | null
) {
  return {
    worktreeKind: worktree.target.kind,
    executionHostId: worktree.target.executionHostId,
    worktreeId: worktree.worktreeId,
    worktreeInstanceId: worktree.instanceId,
    coworkingIncarnationId: worktree.coworkingIncarnationId,
    worktreePath: worktree.target.worktreePath,
    localWslDistro,
    purpose,
    inventoryScope
  }
}
