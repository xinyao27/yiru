import type { TailnetPrincipal } from './wire-contract'

export type CoworkingTicketBinding = {
  requester: TailnetPrincipal
  clientPublicKeyB64: string
  ownerRuntimeId: string
  ownerKeyFingerprint: string
  protocolVersion: number
}

export type CoworkingTicket = {
  value: string
  expiresAt: number
}

export type CoworkingControlRequest = {
  requestId: string
  connectionId: string
  requester: TailnetPrincipal
  instanceId: string
  shareEpoch: string
  requestedAt: number
}

export type CoworkingOwnerDecision = {
  requestId: string
  decision: 'allow' | 'deny'
}

export type CoworkingControlGrant = {
  grantId: string
  ownerRuntimeId: string
  requesterNodeId: string
  connectionId: string
  instanceId: string
  shareEpoch: string
  approvedAt: number
}

export type CoworkingControlDecision =
  | { status: 'granted'; requestId: string; grant: CoworkingControlGrant }
  | { status: 'denied'; requestId: string }
  | { status: 'cancelled'; requestId: string }

export type CoworkingRequesterControlState = {
  worktreeRef: string
  status: 'read-only' | 'pending' | 'granted'
  approvedAt?: number
}

export type CoworkingRequesterControlRequestResult = {
  worktreeRef: string
  status: 'pending' | 'granted'
  approvedAt?: number
}
