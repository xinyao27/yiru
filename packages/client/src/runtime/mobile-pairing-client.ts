import type {
  RuntimeMobileListDevicesResult,
  RuntimeMobileListNetworkInterfacesResult,
  RuntimeMobilePairingQRResult,
  RuntimeMobileRevokeDeviceResult
} from '@yiru/runtime-protocol/contract'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc } from './orpc-client'
import type { RuntimeClientTarget } from './rpc-client'

type RuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

// Why: pairing mints a device credential on the daemon accepting the phone's connection.
// Keep it pinned to the Chrome extension's local daemon when the selected work host changes.
function pairingTarget(_settings?: RuntimeSettings): RuntimeClientTarget {
  return { kind: 'local' }
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
