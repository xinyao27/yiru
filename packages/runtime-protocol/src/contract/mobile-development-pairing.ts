import { type, type ContractRouter } from '@orpc/contract'

import {
  MobileDevelopmentPairingInputSchema,
  type MobileDevelopmentPairingResult
} from '../mobile-development-pairing.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import { mobileHostPairingContract } from './mobile-host-pairing.js'

const LOCAL_DEVELOPMENT_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

// Why: nested here (rather than as a sibling top-level import in router.ts)
// because the RPC access-inventory generator only follows named imports, not
// `export *` — a procedure nested inside an already-imported contract object
// (`mobile: mobileContract` in router.ts) is picked up for free. Mounted as a
// sub-router rather than spread because the generator reads this object
// statically and rejects both spreads and property references.
export const mobileContract = {
  developmentPairing: withAccess(LOCAL_DEVELOPMENT_ACCESS)
    .input(MobileDevelopmentPairingInputSchema)
    .output(type<MobileDevelopmentPairingResult>()),
  hostPairing: mobileHostPairingContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  MOBILE_DEVELOPMENT_PAIRING_CONTRACT,
  MOBILE_DEVELOPMENT_PAIRING_INVALID_ARGUMENT,
  MOBILE_DEVELOPMENT_PAIRING_METHOD,
  MobileDevelopmentPairingInputSchema,
  parseManualNetworkAddress
} from '../mobile-development-pairing.js'
export type {
  MobileDevelopmentPairingInput,
  MobileDevelopmentPairingLegacyContract,
  MobileDevelopmentPairingResult,
  ParseManualAddressResult
} from '../mobile-development-pairing.js'
export * from './mobile-host-pairing.js'
