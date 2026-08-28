import type {
  RuntimeMobileListDevicesResult,
  RuntimeMobileListNetworkInterfacesResult,
  RuntimeMobilePairingQRResult,
  RuntimeMobileRevokeDeviceResult
} from '@yiru/runtime-protocol/contract'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc } from './orpc-client'
import { getActiveRuntimeTarget, type RuntimeClientTarget } from './rpc-client'

type RuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

// Why: pairing mints a device credential against whichever host will accept the
// phone's connection, so the target choice is security-relevant, not cosmetic.
// The shell has always paired to its own machine; a web client has no machine
// of its own and can only mean the runtime it is attached to. Following the
// active environment on desktop would silently move an existing user's pairing
// to a remote host the moment they activated one, so the shell stays pinned.
function pairingTarget(settings?: RuntimeSettings): RuntimeClientTarget {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
    ? getActiveRuntimeTarget(settings)
    : { kind: 'local' }
}

export async function listMobileNetworkInterfaces(
  settings?: RuntimeSettings
): Promise<RuntimeMobileListNetworkInterfacesResult> {
  return callRuntimeOrpc(
    pairingTarget(settings),
    (client) => client.mobile.hostPairing.listNetworkInterfaces,
    {}
  )
}

export async function getMobilePairingQR(
  args: { address?: string; rotate?: boolean },
  settings?: RuntimeSettings
): Promise<RuntimeMobilePairingQRResult> {
  return callRuntimeOrpc(
    pairingTarget(settings),
    (client) => client.mobile.hostPairing.getPairingQR,
    args
  )
}

export async function listPairedMobileDevices(
  settings?: RuntimeSettings
): Promise<RuntimeMobileListDevicesResult> {
  return callRuntimeOrpc(
    pairingTarget(settings),
    (client) => client.mobile.hostPairing.listDevices,
    {}
  )
}

export async function revokePairedMobileDevice(
  args: { deviceId: string },
  settings?: RuntimeSettings
): Promise<RuntimeMobileRevokeDeviceResult> {
  return callRuntimeOrpc(
    pairingTarget(settings),
    (client) => client.mobile.hostPairing.revokeDevice,
    args
  )
}
