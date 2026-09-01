import { networkInterfaces } from 'node:os'

import type {
  RuntimeMobileListDevicesResult,
  RuntimeMobileListNetworkInterfacesResult,
  RuntimeMobilePairingQRResult,
  RuntimeMobileRevokeDeviceResult,
  RuntimeMobileWebSocketReadyResult
} from '@yiru/runtime-protocol/contract'
import { isTailnetIPv4Address } from '@yiru/runtime-protocol/workbench/tailnet-address'

import type { DeviceRegistry } from './device-registry'

type MobilePairingOffer =
  | { available: false }
  | {
      available: true
      deviceId: string
      endpoint: string
      pairingUrl: string
    }

export type MobileHostPairingRuntime = {
  createMobilePairingOffer: (args: {
    address?: string | null
    credentialPolicy?: 'reuse-pending' | 'rotate-pending' | 'reuse-named'
    name?: string
  }) => MobilePairingOffer
  getDeviceRegistry: () => Pick<DeviceRegistry, 'listDevices'> | null
  getWebSocketEndpoint: () => string | null
  revokeMobileDevice: (deviceId: string) => boolean | Promise<boolean>
}

export type MobileHostPairingBridge = {
  listNetworkInterfaces: () => RuntimeMobileListNetworkInterfacesResult
  getPairingQR: (args?: {
    address?: string
    rotate?: boolean
  }) => Promise<RuntimeMobilePairingQRResult>
  listDevices: () => RuntimeMobileListDevicesResult
  revokeDevice: (args: { deviceId: string }) => Promise<RuntimeMobileRevokeDeviceResult>
  isWebSocketReady: () => RuntimeMobileWebSocketReadyResult
}

type NetworkInterface = {
  name: string
  address: string
}

let mobileHostPairingBridge: MobileHostPairingBridge | null = null

function getNetworkInterfaces(): NetworkInterface[] {
  const result: NetworkInterface[] = []
  const interfaces = networkInterfaces()
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses) {
      continue
    }
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        result.push({ name, address: address.address })
      }
    }
  }
  return result.sort(
    (left, right) =>
      Number(isTailnetIPv4Address(right.address)) - Number(isTailnetIPv4Address(left.address))
  )
}

function getDefaultPairingAddress(): string | null {
  return getNetworkInterfaces()[0]?.address ?? null
}

async function buildMobilePairingQR(
  rpcServer: MobileHostPairingRuntime,
  args?: { address?: string; rotate?: boolean }
): Promise<RuntimeMobilePairingQRResult> {
  const address = args?.address ?? getDefaultPairingAddress()
  if (!address) {
    return { available: false }
  }

  const offer = await rpcServer.createMobilePairingOffer({
    address,
    credentialPolicy: args?.rotate ? 'rotate-pending' : 'reuse-pending',
    name: `Mobile ${new Date().toLocaleDateString()}`
  })
  if (!offer.available) {
    return { available: false }
  }

  // Why: pairing is the only consumer, so keep qrcode off the launch path.
  const { default: QRCode } = await import('qrcode')
  const qrDataUrl = await QRCode.toDataURL(offer.pairingUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256
  })

  return {
    available: true,
    qrDataUrl,
    pairingUrl: offer.pairingUrl,
    endpoint: offer.endpoint,
    deviceId: offer.deviceId
  }
}

function listPairedMobileDevices(
  rpcServer: MobileHostPairingRuntime
): RuntimeMobileListDevicesResult {
  const registry = rpcServer.getDeviceRegistry()
  if (!registry) {
    return { devices: [] }
  }
  return {
    devices: registry
      .listDevices()
      .filter((device) => device.scope === 'mobile' && device.lastSeenAt > 0)
      .map((device) => ({
        deviceId: device.deviceId,
        name: device.name,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt
      }))
  }
}

async function revokePairedMobileDevice(
  rpcServer: MobileHostPairingRuntime,
  deviceId: string
): Promise<RuntimeMobileRevokeDeviceResult> {
  if (!rpcServer.getDeviceRegistry()) {
    return { revoked: false }
  }
  return { revoked: await rpcServer.revokeMobileDevice(deviceId) }
}

export function getMobileHostPairingBridge(): MobileHostPairingBridge | null {
  return mobileHostPairingBridge
}

export function installMobileHostPairingBridge(rpcServer: MobileHostPairingRuntime): () => void {
  const bridge: MobileHostPairingBridge = {
    listNetworkInterfaces: () => ({ interfaces: getNetworkInterfaces() }),
    getPairingQR: (args) => buildMobilePairingQR(rpcServer, args),
    listDevices: () => listPairedMobileDevices(rpcServer),
    revokeDevice: (args) => revokePairedMobileDevice(rpcServer, args.deviceId),
    isWebSocketReady: () => ({
      ready: rpcServer.getWebSocketEndpoint() !== null,
      endpoint: rpcServer.getWebSocketEndpoint()
    })
  }
  mobileHostPairingBridge = bridge
  return () => {
    if (mobileHostPairingBridge === bridge) {
      mobileHostPairingBridge = null
    }
  }
}
