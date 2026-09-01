import type {
  MobileDevelopmentPairingInput,
  MobileDevelopmentPairingResult
} from '@yiru/runtime-protocol/mobile-development-pairing'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '@yiru/runtime-protocol/workbench/pairing'

import type { DeviceRegistry } from '../device-registry'
import {
  installMobileHostPairingBridge,
  type MobileHostPairingRuntime
} from '../mobile-host-pairing-bridge'
import { RuntimeRpcHandlerError } from '../rpc/core'

type NodeRuntimeHostMobilePairingOptions = {
  defaultDeviceName: string
  deviceRegistry: DeviceRegistry
  getEndpoint: () => string | null
  publicKeyB64: string
  runtimeUnavailableMessage: string
  terminateDeviceConnections: (deviceToken: string) => void
}

export type NodeRuntimeHostMobilePairing = {
  createDevelopmentPairing: (input: MobileDevelopmentPairingInput) => MobileDevelopmentPairingResult
  installBridge: () => () => void
}

export function createNodeRuntimeHostMobilePairing({
  defaultDeviceName,
  deviceRegistry,
  getEndpoint,
  publicKeyB64,
  runtimeUnavailableMessage,
  terminateDeviceConnections
}: NodeRuntimeHostMobilePairingOptions): NodeRuntimeHostMobilePairing {
  const runtime: MobileHostPairingRuntime = {
    createMobilePairingOffer: (args) => {
      const rawEndpoint = getEndpoint()
      if (!rawEndpoint) {
        return { available: false }
      }
      const endpoint = resolveMobilePairingEndpoint(rawEndpoint, args.address ?? null)
      const deviceName = args.name ?? defaultDeviceName
      const credentialPolicy = args.credentialPolicy ?? 'reuse-pending'
      const device =
        credentialPolicy === 'reuse-named'
          ? deviceRegistry.getOrCreateNamedDevice(deviceName)
          : credentialPolicy === 'rotate-pending'
            ? deviceRegistry.rotatePendingDevice(deviceName)
            : deviceRegistry.getOrCreatePendingDevice(deviceName)
      return {
        available: true,
        pairingUrl: encodePairingOffer({
          v: PAIRING_OFFER_VERSION,
          endpoint,
          deviceToken: device.token,
          publicKeyB64,
          scope: 'mobile'
        }),
        endpoint,
        deviceId: device.deviceId
      }
    },
    getDeviceRegistry: () => deviceRegistry,
    getWebSocketEndpoint: getEndpoint,
    revokeMobileDevice: async (deviceId) => {
      const device = deviceRegistry.getDevice(deviceId)
      if (device?.scope !== 'mobile' || !deviceRegistry.removeDevice(deviceId)) {
        return false
      }
      terminateDeviceConnections(device.token)
      return true
    }
  }

  return {
    createDevelopmentPairing: (input) => {
      const offer = runtime.createMobilePairingOffer({
        address: input.address,
        name: input.deviceName,
        credentialPolicy: 'reuse-named'
      })
      if (!offer.available) {
        throw new RuntimeRpcHandlerError('runtime_unavailable', runtimeUnavailableMessage)
      }
      return {
        pairingUrl: offer.pairingUrl,
        endpoint: offer.endpoint,
        deviceId: offer.deviceId
      }
    },
    installBridge: () => installMobileHostPairingBridge(runtime)
  }
}

export function resolveMobilePairingEndpoint(rawEndpoint: string, address: string | null): string {
  const endpoint = new URL(rawEndpoint)
  const override = address?.trim()
  if (!override) {
    return rawEndpoint
  }
  if (/^wss?:\/\//i.test(override)) {
    return formatWebSocketUrl(new URL(override))
  }
  const parsed = parsePairingAddressOverride(override)
  endpoint.hostname = parsed.host.includes(':')
    ? `[${parsed.host.replace(/^\[|\]$/g, '')}]`
    : parsed.host
  if (parsed.port) {
    endpoint.port = parsed.port
  }
  return formatWebSocketUrl(endpoint)
}

function parsePairingAddressOverride(address: string): { host: string; port: string | null } {
  if (address.startsWith('[') || address.split(':').length === 2) {
    try {
      const parsed = new URL(`ws://${address}`)
      return { host: parsed.hostname.replace(/^\[|\]$/g, ''), port: parsed.port || null }
    } catch {
      return { host: address, port: null }
    }
  }
  return { host: address, port: null }
}

function formatWebSocketUrl(url: URL): string {
  const formatted = url.toString()
  return url.pathname === '/' && !url.search && !url.hash ? formatted.replace(/\/$/, '') : formatted
}
