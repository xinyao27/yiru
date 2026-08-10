import type { TailnetPrincipal } from '../rpc-principal'
import type { CoworkingRemoteDesktop } from './catalog-contract'
import type {
  CoworkingHostAccessDecision,
  CoworkingHostDeviceView,
  CoworkingOwnerHostAccessRequestView
} from './host-access-contract'
import { isCoworkingMutationKind } from './operation-contract'
import type { CoworkingPublicationSuspensionReason } from './publication-suspension'
import { COWORKING_RPC_ERROR_CODES, type CoworkingRpcErrorCode } from './wire-contract'

export const COWORKING_REQUESTER_INVOKE_METHODS = [
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
  'checks.read',
  'session.continue',
  'terminal.launchOptions',
  'terminal.create',
  'terminal.input',
  'terminal.resize'
] as const

export const COWORKING_REQUESTER_SUBSCRIPTION_METHODS = ['terminal.subscribe'] as const

export type CoworkingRequesterInvokeMethod = (typeof COWORKING_REQUESTER_INVOKE_METHODS)[number]
export type CoworkingRequesterSubscriptionMethod =
  (typeof COWORKING_REQUESTER_SUBSCRIPTION_METHODS)[number]

export type CoworkingRequesterRoute = {
  desktopRef: string
  connectionEpoch: number
}

export type CoworkingRequesterInvokeArgs = CoworkingRequesterRoute & {
  method: CoworkingRequesterInvokeMethod
  params: Record<string, unknown>
}

export type CoworkingRequesterSubscriptionArgs = CoworkingRequesterRoute & {
  subscriptionId: string
  method: CoworkingRequesterSubscriptionMethod
  params: Record<string, unknown>
}

export type CoworkingRequesterTransportErrorCode =
  | 'disconnected'
  | 'protocol_error'
  | 'timeout'
  | CoworkingRpcErrorCode

export type CoworkingRequesterSubscriptionEvent =
  | { subscriptionId: string; type: 'next'; value: unknown }
  | { subscriptionId: string; type: 'error'; code: CoworkingRequesterTransportErrorCode }
  | { subscriptionId: string; type: 'complete' }

const COWORKING_REQUESTER_TRANSPORT_ERROR_CODES: ReadonlySet<CoworkingRequesterTransportErrorCode> =
  new Set(['disconnected', 'protocol_error', 'timeout', ...COWORKING_RPC_ERROR_CODES])

export function isCoworkingRequesterInvokeMethod(
  value: string
): value is CoworkingRequesterInvokeMethod {
  return (COWORKING_REQUESTER_INVOKE_METHODS as readonly string[]).includes(value)
}

export function isCoworkingRequesterSubscriptionMethod(
  value: string
): value is CoworkingRequesterSubscriptionMethod {
  return (COWORKING_REQUESTER_SUBSCRIPTION_METHODS as readonly string[]).includes(value)
}

export function isCoworkingRequesterMutationMethod(
  method: CoworkingRequesterInvokeMethod
): boolean {
  return isCoworkingMutationKind(method)
}

export function isCoworkingRequesterTransportErrorCode(
  value: string
): value is CoworkingRequesterTransportErrorCode {
  return COWORKING_REQUESTER_TRANSPORT_ERROR_CODES.has(
    value as CoworkingRequesterTransportErrorCode
  )
}

export type CoworkingOwnerWorktreeSharing = {
  worktreeId: string
  projectId: string | null
  displayName: string
  visibility: 'public' | 'private'
  publicationStatus: 'pending-validation' | 'private' | 'published' | 'suspended'
  shareEpoch: string | null
  /** Why: 'suspended' alone cannot be acted on — the owner needs to know
   *  whether the host went away, the worktree was re-created, or two shares
   *  overlap on one root. */
  suspensionReason?: CoworkingPublicationSuspensionReason
}

export type CoworkingOwnerControlRequestView = {
  requestId: string
  requester: TailnetPrincipal
  worktreeId: string
  projectDisplayName: string
  worktreeDisplayName: string
  requestedAt: number
}

export type CoworkingOwnerControlGrantView = {
  grantId: string
  requester: TailnetPrincipal
  worktreeId: string
  worktreeDisplayName: string
  approvedAt: number
}

/** A peer currently authenticated against this desktop's ingress. Present for
 *  the whole connection, including a read-only peer that never asks for
 *  control — those hold neither a request nor a grant. */
export type CoworkingActiveConnectionView = {
  connectionId: string
  requester: TailnetPrincipal
  hasControl: boolean
}

export type CoworkingRequesterControlView = {
  desktopRef: string
  worktreeRef: string
  connectionEpoch: number
  status: 'read-only' | 'pending' | 'granted'
  approvedAt?: number
}

/** This desktop's own tailnet identity, so the owner UI can name the device it
 *  is sharing as. Null until the first successful tailnet read. */
export type CoworkingSelfIdentity = {
  nodeDisplayName: string
  userDisplayName: string
}

export type CoworkingSharingSnapshot = {
  status: 'starting' | 'ready' | 'unavailable'
  diagnostic: string | null
  self: CoworkingSelfIdentity | null
  remoteDesktops: readonly CoworkingRemoteDesktop[]
  ownerWorktrees: readonly CoworkingOwnerWorktreeSharing[]
  ownerControlRequests: readonly CoworkingOwnerControlRequestView[]
  ownerHostAccessRequests: readonly CoworkingOwnerHostAccessRequestView[]
  ownerControlGrants: readonly CoworkingOwnerControlGrantView[]
  ownerActiveConnections: readonly CoworkingActiveConnectionView[]
  requesterControlStates: readonly CoworkingRequesterControlView[]
}

export type CoworkingSetWorktreeVisibilityArgs = {
  worktreeId: string
  visibility: 'public' | 'private'
}

export type CoworkingSetProjectVisibilityArgs = {
  projectId: string
  visibility: 'public' | 'private'
}

export type CoworkingRequestControlArgs = {
  desktopRef: string
  worktreeRef: string
}

export type CoworkingDecideControlArgs = {
  requestId: string
  decision: 'allow' | 'deny'
}

export type CoworkingRevokeControlArgs = {
  grantId: string
}

export type CoworkingRequestHostAccessArgs = {
  desktopRef: string
}

export type CoworkingRequestHostAccessResult =
  | { status: 'denied' | 'cancelled' }
  | { status: 'granted'; environmentId: string }

export type CoworkingDecideHostAccessArgs = CoworkingHostAccessDecision

export type CoworkingListHostDevicesResult = {
  devices: readonly CoworkingHostDeviceView[]
}

export type CoworkingRevokeHostDeviceArgs = {
  deviceId: string
}

export type CoworkingRevokeHostDeviceResult = {
  revoked: boolean
}
