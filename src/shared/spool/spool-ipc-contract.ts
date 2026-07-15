import type { TailnetPrincipal } from '../rpc-principal'
import type { SpoolRemoteDesktop } from './spool-catalog-contract'
import { isSpoolMutationKind } from './spool-operation-contract'
import { SPOOL_RPC_ERROR_CODES, type SpoolRpcErrorCode } from './spool-wire-contract'

export const SPOOL_REQUESTER_INVOKE_METHODS = [
  'files.list',
  'files.read',
  'files.diff',
  'files.write',
  'files.mkdir',
  'files.rename',
  'files.delete',
  'git.status',
  'git.diff',
  'git.history',
  'git.stage',
  'git.unstage',
  'git.commit',
  'session.read',
  'session.continue',
  'terminal.input',
  'terminal.resize'
] as const

export const SPOOL_REQUESTER_SUBSCRIPTION_METHODS = ['terminal.subscribe'] as const

export type SpoolRequesterInvokeMethod = (typeof SPOOL_REQUESTER_INVOKE_METHODS)[number]
export type SpoolRequesterSubscriptionMethod = (typeof SPOOL_REQUESTER_SUBSCRIPTION_METHODS)[number]

export type SpoolRequesterRoute = {
  desktopRef: string
  connectionEpoch: number
}

export type SpoolRequesterInvokeArgs = SpoolRequesterRoute & {
  method: SpoolRequesterInvokeMethod
  params: unknown
}

export type SpoolRequesterSubscriptionArgs = SpoolRequesterRoute & {
  subscriptionId: string
  method: SpoolRequesterSubscriptionMethod
  params: unknown
}

export type SpoolRequesterSubscriptionStartResult = {
  subscriptionId: string
}

export type SpoolRequesterSubscriptionStopArgs = {
  subscriptionId: string
}

export type SpoolRequesterSubscriptionStopResult = {
  stopped: boolean
}

export type SpoolRequesterTransportErrorCode =
  | 'disconnected'
  | 'protocol_error'
  | 'timeout'
  | SpoolRpcErrorCode

export type SpoolRequesterSubscriptionEvent =
  | { subscriptionId: string; type: 'next'; value: unknown }
  | { subscriptionId: string; type: 'error'; code: SpoolRequesterTransportErrorCode }
  | { subscriptionId: string; type: 'complete' }

const SPOOL_REQUESTER_TRANSPORT_ERROR_CODES: ReadonlySet<SpoolRequesterTransportErrorCode> =
  new Set(['disconnected', 'protocol_error', 'timeout', ...SPOOL_RPC_ERROR_CODES])

export function isSpoolRequesterInvokeMethod(value: string): value is SpoolRequesterInvokeMethod {
  return (SPOOL_REQUESTER_INVOKE_METHODS as readonly string[]).includes(value)
}

export function isSpoolRequesterSubscriptionMethod(
  value: string
): value is SpoolRequesterSubscriptionMethod {
  return (SPOOL_REQUESTER_SUBSCRIPTION_METHODS as readonly string[]).includes(value)
}

export function isSpoolRequesterMutationMethod(method: SpoolRequesterInvokeMethod): boolean {
  return isSpoolMutationKind(method)
}

export function isSpoolRequesterTransportErrorCode(
  value: string
): value is SpoolRequesterTransportErrorCode {
  return SPOOL_REQUESTER_TRANSPORT_ERROR_CODES.has(value as SpoolRequesterTransportErrorCode)
}

export type SpoolOwnerWorktreeSharing = {
  worktreeId: string
  projectId: string | null
  displayName: string
  visibility: 'public' | 'private'
  publicationStatus: 'pending-validation' | 'private' | 'published' | 'suspended'
  shareEpoch: string | null
}

export type SpoolOwnerControlRequestView = {
  requestId: string
  requester: TailnetPrincipal
  worktreeId: string
  projectDisplayName: string
  worktreeDisplayName: string
  requestedAt: number
}

export type SpoolOwnerControlGrantView = {
  grantId: string
  requester: TailnetPrincipal
  worktreeId: string
  worktreeDisplayName: string
  approvedAt: number
}

export type SpoolRequesterControlView = {
  desktopRef: string
  worktreeRef: string
  connectionEpoch: number
  status: 'read-only' | 'pending' | 'granted'
  approvedAt?: number
}

export type SpoolSharingSnapshot = {
  status: 'starting' | 'ready' | 'unavailable'
  diagnostic: string | null
  remoteDesktops: readonly SpoolRemoteDesktop[]
  ownerWorktrees: readonly SpoolOwnerWorktreeSharing[]
  ownerControlRequests: readonly SpoolOwnerControlRequestView[]
  ownerControlGrants: readonly SpoolOwnerControlGrantView[]
  requesterControlStates: readonly SpoolRequesterControlView[]
}

export type SpoolSetWorktreeVisibilityArgs = {
  worktreeId: string
  visibility: 'public' | 'private'
}

export type SpoolSetProjectVisibilityArgs = {
  projectId: string
  visibility: 'public' | 'private'
}

export type SpoolRequestControlArgs = {
  desktopRef: string
  worktreeRef: string
}

export type SpoolDecideControlArgs = {
  requestId: string
  decision: 'allow' | 'deny'
}

export type SpoolRevokeControlArgs = {
  grantId: string
}
