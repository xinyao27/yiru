import { z } from 'zod'

import { PairingOfferSchema } from '../pairing'
import type { TailnetPrincipal } from '../rpc-principal'

export const COWORKING_HOST_ACCESS_TIERS = ['read', 'host'] as const
export type CoworkingHostAccessTier = (typeof COWORKING_HOST_ACCESS_TIERS)[number]

export type CoworkingHostAccessRequest = {
  requestId: string
  connectionId: string
  requester: TailnetPrincipal
  requestedAt: number
}

export type CoworkingHostAccessDecision =
  | { requestId: string; decision: 'deny' }
  | {
      requestId: string
      decision: 'allow'
      name: string
      tier: CoworkingHostAccessTier
    }

export const CoworkingHostAccessRequestResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('denied') }).strict(),
  z.object({ status: z.literal('cancelled') }).strict(),
  z
    .object({
      status: z.literal('granted'),
      offer: PairingOfferSchema
    })
    .strict()
])

export type CoworkingHostAccessRequestResult = z.infer<
  typeof CoworkingHostAccessRequestResultSchema
>

export type CoworkingOwnerHostAccessRequestView = Omit<CoworkingHostAccessRequest, 'connectionId'>

export type CoworkingHostDeviceView = {
  deviceId: string
  name: string
  pairedAt: number
  lastSeenAt: number | null
  subject: { nodeId: string; userDisplayName: string }
  tier: 'read' | 'control' | 'host'
  expiresAt: number | null
  revokedAt: number | null
}
