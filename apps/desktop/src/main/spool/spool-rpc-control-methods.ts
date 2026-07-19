import type {
  SpoolControlGrant,
  SpoolControlRequest,
  SpoolRequesterControlRequestResult,
  SpoolRequesterControlState
} from '../../shared/spool/spool-access-contract'
import type { SpoolAccessAuthority } from './spool-access-authority'
import { SpoolAccessError } from './spool-access-authority'
import { SpoolRpcError, type SpoolRpcInvocationContext } from './spool-rpc-gateway'
import { createSpoolRpcStream } from './spool-rpc-stream'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

export type WorktreeInvocation = {
  kind: 'worktree'
  worktreeRef: string
  worktree: SpoolPublicWorktreeInstance
}

export function createControlStream(
  authority: SpoolAccessAuthority,
  invocation: WorktreeInvocation,
  context: SpoolRpcInvocationContext
) {
  return createSpoolRpcStream((sink) => {
    let requests: readonly SpoolControlRequest[] = []
    let grants: readonly SpoolControlGrant[] = []
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
  authority: SpoolAccessAuthority,
  invocation: WorktreeInvocation,
  context: SpoolRpcInvocationContext
): SpoolRequesterControlRequestResult {
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

export function projectAccessError(error: unknown): SpoolRpcError {
  if (error instanceof SpoolAccessError) {
    return new SpoolRpcError(error.code)
  }
  return new SpoolRpcError('internal_error')
}

export function asWorktreeInvocation(value: unknown): WorktreeInvocation {
  const invocation = value as Partial<WorktreeInvocation>
  if (invocation.kind !== 'worktree' || !invocation.worktree || !invocation.worktreeRef) {
    throw new SpoolRpcError('resource_not_found')
  }
  return invocation as WorktreeInvocation
}

function projectControlState(
  invocation: WorktreeInvocation,
  connectionId: string,
  requests: readonly SpoolControlRequest[],
  grants: readonly SpoolControlGrant[]
): SpoolRequesterControlState {
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
  worktree: SpoolPublicWorktreeInstance,
  grants: readonly SpoolControlGrant[]
): SpoolControlGrant | null {
  return (
    grants.find(
      (grant) =>
        grant.connectionId === connectionId &&
        grant.instanceId === worktree.instanceId &&
        grant.shareEpoch === worktree.shareEpoch
    ) ?? null
  )
}
