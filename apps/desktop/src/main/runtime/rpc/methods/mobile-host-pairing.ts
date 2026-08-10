import type {
  MobileHostPairingQRInput,
  MobileRevokeDeviceInput,
  RuntimeMobileListDevicesResult,
  RuntimeMobileListNetworkInterfacesResult,
  RuntimeMobilePairingQRResult,
  RuntimeMobileRevokeDeviceResult,
  RuntimeMobileWebSocketReadyResult
} from '@yiru/runtime-protocol/contract'
import { getMobileHostPairingBridge } from '~main/runtime/mobile-host-pairing-bridge'

import { RuntimeRpcHandlerError } from '../core'

// Why: `mobile.hostPairing.*` handlers run in-process with only `RpcContext`
// in scope — no reference to the YiruRuntimeRpcServer instance that owns the
// device registry and pairing offers. See the `mobileHostPairingBridge`
// singleton in `../../mobile` for why (unchanged by the Phase 6 D-stage move
// from legacy `defineMethod` registration to direct contract wiring).
function requireMobileHostPairingBridge() {
  const bridge = getMobileHostPairingBridge()
  if (!bridge) {
    throw new RuntimeRpcHandlerError('method_not_found', 'Mobile host pairing is not available yet')
  }
  return bridge
}

export function handleMobileHostPairingListNetworkInterfaces(): RuntimeMobileListNetworkInterfacesResult {
  return requireMobileHostPairingBridge().listNetworkInterfaces()
}

export function handleMobileHostPairingGetPairingQR(
  params: MobileHostPairingQRInput
): Promise<RuntimeMobilePairingQRResult> {
  return requireMobileHostPairingBridge().getPairingQR(params)
}

export function handleMobileHostPairingListDevices(): RuntimeMobileListDevicesResult {
  return requireMobileHostPairingBridge().listDevices()
}

export function handleMobileHostPairingRevokeDevice(
  params: MobileRevokeDeviceInput
): Promise<RuntimeMobileRevokeDeviceResult> {
  return requireMobileHostPairingBridge().revokeDevice(params)
}

export function handleMobileHostPairingIsWebSocketReady(): RuntimeMobileWebSocketReadyResult {
  return requireMobileHostPairingBridge().isWebSocketReady()
}
