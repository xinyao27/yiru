import { networkInterfaces } from 'node:os'

import type {
  MobileDevelopmentPairingInput,
  MobileDevelopmentPairingResult,
  MobileHostPairingQRInput,
  RuntimeMobileListDevicesResult,
  RuntimeMobileListNetworkInterfacesResult,
  RuntimeMobilePairingQRResult,
  RuntimeMobileRevokeDeviceResult,
  RuntimeMobileWebSocketReadyResult
} from '@yiru/runtime-protocol/contract'
import { PAIRING_OFFER_VERSION } from '@yiru/runtime-protocol/mobile/pairing-offer'
import QRCode from 'qrcode'

import type { MobileDeviceStore } from './devices'

export type MobilePairingOptions = {
  devices: MobileDeviceStore
  publicKeyB64: string
  readEndpoint: () => string | null
}

export class MobilePairing {
  private readonly devices: MobileDeviceStore
  private readonly publicKeyB64: string
  private readonly readEndpoint: () => string | null

  constructor(options: MobilePairingOptions) {
    this.devices = options.devices
    this.publicKeyB64 = options.publicKeyB64
    this.readEndpoint = options.readEndpoint
  }

  create(input: MobileDevelopmentPairingInput): MobileDevelopmentPairingResult {
    const rawEndpoint = this.readEndpoint()
    if (!rawEndpoint) {
      throw new Error('mobile_server_unavailable')
    }
    const endpoint = replaceEndpointAddress(rawEndpoint, input.address)
    const device = this.devices.getOrCreateNamed(input.deviceName)
    return {
      deviceId: device.id,
      endpoint,
      pairingUrl: encodePairingOffer({
        deviceToken: device.token,
        endpoint,
        publicKeyB64: this.publicKeyB64,
        scope: 'mobile',
        v: PAIRING_OFFER_VERSION
      })
    }
  }

  listNetworkInterfaces(): RuntimeMobileListNetworkInterfacesResult {
    const interfaces = Object.entries(networkInterfaces())
      .flatMap(([name, addresses]) =>
        (addresses ?? [])
          .filter((address) => address.family === 'IPv4' && !address.internal)
          .map((address) => ({ address: address.address, name }))
      )
      .sort((left, right) => left.name.localeCompare(right.name))
    return { interfaces }
  }

  async createQr(input: MobileHostPairingQRInput): Promise<RuntimeMobilePairingQRResult> {
    const address = input.address ?? this.listNetworkInterfaces().interfaces[0]?.address
    const rawEndpoint = this.readEndpoint()
    if (!address || !rawEndpoint) {
      return { available: false }
    }
    const endpoint = replaceEndpointAddress(rawEndpoint, address)
    const device = this.devices.getOrCreatePending(
      `Mobile ${new Date().toLocaleDateString()}`,
      input.rotate === true
    )
    const pairingUrl = encodePairingOffer({
      deviceToken: device.token,
      endpoint,
      publicKeyB64: this.publicKeyB64,
      scope: 'mobile',
      v: PAIRING_OFFER_VERSION
    })
    return {
      available: true,
      deviceId: device.id,
      endpoint,
      pairingUrl,
      qrDataUrl: await QRCode.toDataURL(pairingUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 256
      })
    }
  }

  listDevices(): RuntimeMobileListDevicesResult {
    return {
      devices: this.devices.listPaired().map((device) => ({
        deviceId: device.id,
        lastSeenAt: device.lastSeenAt,
        name: device.name,
        pairedAt: device.pairedAt
      }))
    }
  }

  revokeDevice(deviceId: string): RuntimeMobileRevokeDeviceResult {
    return { revoked: this.devices.remove(deviceId) }
  }

  webSocketReady(): RuntimeMobileWebSocketReadyResult {
    const endpoint = this.readEndpoint()
    return { endpoint, ready: endpoint !== null }
  }
}

function replaceEndpointAddress(rawEndpoint: string, address: string): string {
  const endpoint = new URL(rawEndpoint)
  const parsed = new URL(`ws://${address}`)
  endpoint.hostname = parsed.hostname
  endpoint.port = parsed.port || endpoint.port
  return endpoint.href
}

function encodePairingOffer(offer: {
  deviceToken: string
  endpoint: string
  publicKeyB64: string
  scope: 'mobile'
  v: number
}): string {
  const code = Buffer.from(JSON.stringify(offer), 'utf8').toString('base64url')
  return `yiru://pair?code=${code}`
}
