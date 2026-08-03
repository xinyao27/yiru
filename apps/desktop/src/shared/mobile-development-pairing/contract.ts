import { z } from 'zod'

import { parseManualNetworkAddress } from '../network/manual-address'

export const MOBILE_DEVELOPMENT_PAIRING_METHOD = 'mobile.developmentPairing'

export const MobileDevelopmentPairingParamsSchema = z.object({
  address: z
    .string()
    .trim()
    .refine((value) => parseManualNetworkAddress(value).ok),
  deviceName: z.string().trim().min(1).max(256)
})

export type MobileDevelopmentPairingResult = {
  pairingUrl: string
  endpoint: string
  deviceId: string
}
