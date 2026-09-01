import type { MobilePairing } from '../mobile/pairing'
import { daemonImplementation } from './contract'

export function createMobileRouter(pairing: MobilePairing) {
  return {
    developmentPairing: daemonImplementation.mobile.developmentPairing.handler(({ input }) =>
      pairing.create(input)
    ),
    hostPairing: {
      getPairingQR: daemonImplementation.mobile.hostPairing.getPairingQR.handler(({ input }) =>
        pairing.createQr(input)
      ),
      isWebSocketReady: daemonImplementation.mobile.hostPairing.isWebSocketReady.handler(() =>
        pairing.webSocketReady()
      ),
      listDevices: daemonImplementation.mobile.hostPairing.listDevices.handler(() =>
        pairing.listDevices()
      ),
      listNetworkInterfaces: daemonImplementation.mobile.hostPairing.listNetworkInterfaces.handler(
        () => pairing.listNetworkInterfaces()
      ),
      revokeDevice: daemonImplementation.mobile.hostPairing.revokeDevice.handler(({ input }) =>
        pairing.revokeDevice(input.deviceId)
      )
    }
  }
}
