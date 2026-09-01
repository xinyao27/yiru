import { z } from 'zod'

export const PAIRING_OFFER_VERSION = 2
const PairingScopeSchema = z.enum(['mobile', 'runtime'])
export const PairingOfferSchema = z
  .object({
    v: z.literal(PAIRING_OFFER_VERSION),
    endpoint: z.string().min(1),
    deviceToken: z.string().min(1),
    publicKeyB64: z.string().min(1),
    scope: PairingScopeSchema.optional()
  })
  .strict()
export type PairingOffer = z.infer<typeof PairingOfferSchema>
