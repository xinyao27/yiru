import type { TailnetPrincipal } from './spool-wire-contract'

export type SpoolTicketBinding = {
  requester: TailnetPrincipal
  clientPublicKeyB64: string
  ownerRuntimeId: string
  ownerKeyFingerprint: string
  protocolVersion: number
}

export type SpoolTicket = {
  value: string
  expiresAt: number
}

export type SpoolControlRequest = {
  requestId: string
  connectionId: string
  requester: TailnetPrincipal
  instanceId: string
  shareEpoch: string
  requestedAt: number
}

export type SpoolOwnerDecision = {
  requestId: string
  decision: 'allow' | 'deny'
}

export type SpoolControlGrant = {
  grantId: string
  ownerRuntimeId: string
  requesterNodeId: string
  connectionId: string
  instanceId: string
  shareEpoch: string
  approvedAt: number
}

export type SpoolControlDecision =
  | { status: 'granted'; requestId: string; grant: SpoolControlGrant }
  | { status: 'denied'; requestId: string }
  | { status: 'cancelled'; requestId: string }

export type SpoolRequesterControlState = {
  worktreeRef: string
  status: 'read-only' | 'pending' | 'granted'
  approvedAt?: number
}

export type SpoolRequesterControlRequestResult = {
  worktreeRef: string
  status: 'pending' | 'granted'
  approvedAt?: number
}
