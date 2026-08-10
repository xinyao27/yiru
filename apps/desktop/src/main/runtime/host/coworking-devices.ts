import type { CoworkingOwnerCompositionOptions } from '~main/coworking/owner/composition'
import type { CoworkingHostDeviceView } from '~shared/coworking/host-access-contract'
import { PAIRING_OFFER_VERSION } from '~shared/pairing'

import type { DeviceRegistry } from '../device-registry'
import type { CoworkingHostDeviceEntry } from '../device-registry'
import type { MobileSocketWiring } from '../rpc/mobile-socket-wiring'

type CoworkingRuntimeRpc = CoworkingOwnerCompositionOptions['runtimeRpc']

type NodeRuntimeHostCoworkingDevicesOptions = {
  deviceRegistry: DeviceRegistry
  getEndpoint: () => string | null
  publicKeyB64: string
  wiring: MobileSocketWiring
}

export function createNodeRuntimeHostCoworkingDevices({
  deviceRegistry,
  getEndpoint,
  publicKeyB64,
  wiring
}: NodeRuntimeHostCoworkingDevicesOptions): CoworkingRuntimeRpc {
  return {
    createCoworkingHostPairingOffer: (args) => {
      const endpoint = getEndpoint()
      if (!endpoint) {
        throw new Error('coworking_host_pairing_unavailable')
      }
      const device = deviceRegistry.addCoworkingHostDevice(args)
      return {
        v: PAIRING_OFFER_VERSION,
        endpoint,
        deviceToken: device.token,
        publicKeyB64,
        scope: 'runtime'
      }
    },
    listCoworkingHostDevices: () =>
      deviceRegistry
        .listDevices()
        .filter((device): device is CoworkingHostDeviceEntry => device.scope === 'coworking-host')
        .sort((a, b) => b.pairedAt - a.pairedAt)
        .map(projectCoworkingHostDevice),
    revokeCoworkingHostDevice: (deviceId) => {
      const device = deviceRegistry.getDevice(deviceId)
      if (device?.scope !== 'coworking-host' || !deviceRegistry.revokeDevice(deviceId)) {
        return false
      }
      for (const subjectDevice of deviceRegistry.listDevices()) {
        if (
          subjectDevice.scope === 'coworking-host' &&
          subjectDevice.subject.nodeId === device.subject.nodeId
        ) {
          wiring.terminateDeviceConnections(subjectDevice.token)
        }
      }
      return true
    }
  }
}

function projectCoworkingHostDevice(device: CoworkingHostDeviceEntry): CoworkingHostDeviceView {
  return {
    deviceId: device.deviceId,
    name: device.name,
    pairedAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt > 0 ? device.lastSeenAt : null,
    subject: device.subject,
    tier: device.tier,
    expiresAt: device.expiresAt,
    revokedAt: device.revokedAt
  }
}
