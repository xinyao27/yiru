// Projection of owner-side runtime state onto the renderer sharing contract.
// Separate from the service because its reason to change is the IPC shape, not
// the sharing lifecycle.

import type {
  CoworkingControlGrant,
  CoworkingControlRequest
} from '~shared/coworking/access-contract'
import type {
  CoworkingActiveConnectionView,
  CoworkingOwnerControlGrantView,
  CoworkingOwnerControlRequestView,
  CoworkingOwnerWorktreeSharing
} from '~shared/coworking/ipc-contract'
import type { AuthenticatedCoworkingPrincipal } from '~shared/coworking/wire-contract'

import type { CoworkingWorktreeVisibility } from '../worktree-visibility'
import type { CoworkingOwnerWorktreeDescriptor } from './service-options'

export type CoworkingOwnerProjectionContext = {
  visibility: Pick<CoworkingWorktreeVisibility, 'snapshot'>
  describeOwnerWorktree: (worktreeId: string) => CoworkingOwnerWorktreeDescriptor | null
  getConnectionPrincipal: (connectionId: string) => AuthenticatedCoworkingPrincipal | null
}

type OwnerTarget = CoworkingOwnerWorktreeDescriptor & { worktreeId: string }

export function projectOwnerWorktrees(
  context: CoworkingOwnerProjectionContext
): readonly CoworkingOwnerWorktreeSharing[] {
  return context.visibility.snapshot().worktrees.flatMap((entry) => {
    const descriptor = context.describeOwnerWorktree(entry.worktreeId)
    return descriptor
      ? [
          {
            worktreeId: entry.worktreeId,
            projectId: descriptor.projectId,
            displayName: descriptor.displayName,
            visibility: entry.visibility,
            publicationStatus: entry.publicationStatus,
            shareEpoch: entry.shareEpoch,
            ...(entry.suspensionReason ? { suspensionReason: entry.suspensionReason } : {})
          }
        ]
      : []
  })
}

export function projectOwnerRequest(
  context: CoworkingOwnerProjectionContext,
  request: CoworkingControlRequest
): CoworkingOwnerControlRequestView | null {
  const target = findOwnerTarget(context, request.instanceId)
  return target
    ? {
        requestId: request.requestId,
        requester: { ...request.requester },
        worktreeId: target.worktreeId,
        projectDisplayName: target.projectDisplayName,
        worktreeDisplayName: target.displayName,
        requestedAt: request.requestedAt
      }
    : null
}

export function projectOwnerGrant(
  context: CoworkingOwnerProjectionContext,
  grant: CoworkingControlGrant
): CoworkingOwnerControlGrantView | null {
  const target = findOwnerTarget(context, grant.instanceId)
  const principal = context.getConnectionPrincipal(grant.connectionId)
  return target && principal
    ? {
        grantId: grant.grantId,
        requester: { ...principal.tailnet },
        worktreeId: target.worktreeId,
        worktreeDisplayName: target.displayName,
        approvedAt: grant.approvedAt
      }
    : null
}

export function projectActiveConnections(
  connections: readonly AuthenticatedCoworkingPrincipal[],
  grants: readonly CoworkingControlGrant[]
): readonly CoworkingActiveConnectionView[] {
  // Why: unlike requests and grants this never drops a row for an unresolved
  // worktree — the point is that the peer is connected at all.
  const controllingConnectionIds = new Set(grants.map((grant) => grant.connectionId))
  return connections.map((principal) => ({
    connectionId: principal.connectionId,
    requester: { ...principal.tailnet },
    hasControl: controllingConnectionIds.has(principal.connectionId)
  }))
}

function findOwnerTarget(
  context: CoworkingOwnerProjectionContext,
  instanceId: string
): OwnerTarget | null {
  const state = context.visibility
    .snapshot()
    .worktrees.find((worktree) => worktree.instanceId === instanceId)
  const descriptor = state ? context.describeOwnerWorktree(state.worktreeId) : null
  return state && descriptor ? { ...descriptor, worktreeId: state.worktreeId } : null
}
