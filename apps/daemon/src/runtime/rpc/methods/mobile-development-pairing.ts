import { MOBILE_DEVELOPMENT_PAIRING_METHOD } from '@yiru/runtime-protocol/mobile-development-pairing'
import type {
  MobileDevelopmentPairingInput,
  MobileDevelopmentPairingResult
} from '@yiru/runtime-protocol/mobile-development-pairing'

import { RuntimeRpcHandlerError, type RpcContext } from '../core'

export function handleMobileDevelopmentPairing(
  params: MobileDevelopmentPairingInput,
  { mobileDevelopmentPairing }: RpcContext
): MobileDevelopmentPairingResult {
  if (!mobileDevelopmentPairing) {
    throw new RuntimeRpcHandlerError(
      'method_not_found',
      `Unknown method: ${MOBILE_DEVELOPMENT_PAIRING_METHOD}`
    )
  }
  return mobileDevelopmentPairing(params)
}
