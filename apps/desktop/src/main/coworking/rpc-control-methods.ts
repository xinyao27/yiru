import type {
  CoworkingControlGrant,
  CoworkingControlRequest,
  CoworkingRequesterControlRequestResult,
  CoworkingRequesterControlState
} from '../../shared/coworking/access-contract'
import type { CoworkingAccessAuthority } from './access-authority'
import { CoworkingAccessError } from './access-authority'
import { CoworkingRpcError, type CoworkingRpcInvocationContext } from './rpc-gateway'
import { createCoworkingRpcStream } from './rpc-stream'
import type { CoworkingPublicWorktreeInstance } from './worktree-visibility'

export type WorktreeInvocation = {
  kind: 'worktree'
  worktreeRef: string
  worktree: CoworkingPublicWorktreeInstance
}

export function createControlStream(
  authority: CoworkingAccessAuthority,
  invocation: WorktreeInvocation,
  context: CoworkingRpcInvocationContext
) {
  return createCoworkingRpcStream((sink) => {
    let requests: readonly CoworkingControlRequest[] = []
    let grants: readonly CoworkingControlGrant[] = []
    let fingerprint = ''
    const publish = (): void => {
      const state = projectControlState(
        invocation,
        context.principal.connectionId,
        requests,
        grants
      )
      const nextFingerprint = JSON.stringify(state)
      if (nextFingerprint !== fingerprint) {
        fingerprint = nextFingerprint
        sink.next(state)
      }
    }
    const unsubscribeRequests = authority.subscribeOwnerRequests((next) => {
      requests = next
      publish()
    })
    const unsubscribeGrants = authority.subscribeGrants((next) => {
      grants = next
      publish()
    })
    return () => {
      unsubscribeRequests()
      unsubscribeGrants()
    }
  })
}

export function requestControl(
  authority: CoworkingAccessAuthority,
  invocation: WorktreeInvocation,
  context: CoworkingRpcInvocationContext
): CoworkingRequesterControlRequestResult {
  const existing = authority.getControlGrant(
    context.principal.connectionId,
    invocation.worktree.instanceId,
    invocation.worktree.shareEpoch
  )
  if (existing) {
    return {
      worktreeRef: invocation.worktreeRef,
      status: 'granted',
      approvedAt: existing.approvedAt
    }
  }
  try {
    authority.request({
      connectionId: context.principal.connectionId,
      instanceId: invocation.worktree.instanceId,
      shareEpoch: invocation.worktree.shareEpoch
    })
  } catch (error) {
    throw projectAccessError(error)
  }
  return { worktreeRef: invocation.worktreeRef, status: 'pending' }
}

export function projectAccessError(error: unknown): CoworkingRpcError {
  if (error instanceof CoworkingAccessError) {
    return new CoworkingRpcError(error.code)
  }
  return new CoworkingRpcError('internal_error')
}

export function asWorktreeInvocation(value: unknown): WorktreeInvocation {
  const invocation = value as Partial<WorktreeInvocation>
  if (invocation.kind !== 'worktree' || !invocation.worktree || !invocation.worktreeRef) {
    throw new CoworkingRpcError('resource_not_found')
  }
  return invocation as WorktreeInvocation
}

function projectControlState(
  invocation: WorktreeInvocation,
  connectionId: string,
  requests: readonly CoworkingControlRequest[],
  grants: readonly CoworkingControlGrant[]
): CoworkingRequesterControlState {
  const grant = findGrant(connectionId, invocation.worktree, grants)
  if (grant) {
    return {
      worktreeRef: invocation.worktreeRef,
      status: 'granted',
      approvedAt: grant.approvedAt
    }
  }
  const pending = requests.some(
    (request) =>
      request.connectionId === connectionId &&
      request.instanceId === invocation.worktree.instanceId &&
      request.shareEpoch === invocation.worktree.shareEpoch
  )
  return { worktreeRef: invocation.worktreeRef, status: pending ? 'pending' : 'read-only' }
}

function findGrant(
  connectionId: string,
  worktree: CoworkingPublicWorktreeInstance,
  grants: readonly CoworkingControlGrant[]
): CoworkingControlGrant | null {
  return (
    grants.find(
      (grant) =>
        grant.connectionId === connectionId &&
        grant.instanceId === worktree.instanceId &&
        grant.shareEpoch === worktree.shareEpoch
    ) ?? null
  )
}
