import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

// Why: pairing a phone (and managing devices already paired) is a host
// capability, not a desktop-shell one — the QR/network-interface data
// describes THIS host's own reachable addresses, and revoking/listing
// devices mutates THIS host's device registry. A client managing a remote
// host needs this surface exactly as much as the local desktop app does.
// Distinct from `mobile.developmentPairing` (mobile-development-pairing.ts),
// which is a `--local`-only CLI dev tool with unrelated semantics.

export type RuntimeMobileNetworkInterface = {
  name: string
  address: string
}

export type RuntimeMobileListNetworkInterfacesResult = {
  interfaces: RuntimeMobileNetworkInterface[]
}

export const MobileHostPairingQRInputSchema = z.object({
  address: z.string().optional(),
  rotate: z.boolean().optional()
})

export type MobileHostPairingQRInput = z.output<typeof MobileHostPairingQRInputSchema>

export type RuntimeMobilePairingQRResult =
  | { available: false }
  | {
      available: true
      qrDataUrl: string
      pairingUrl: string
      endpoint: string
      deviceId: string
    }

export type RuntimeMobilePairedDevice = {
  deviceId: string
  name: string
  pairedAt: number
  lastSeenAt: number
}

export type RuntimeMobileListDevicesResult = {
  devices: RuntimeMobilePairedDevice[]
}

export const MobileRevokeDeviceInputSchema = z.object({
  deviceId: z.string().min(1)
})

export type MobileRevokeDeviceInput = z.output<typeof MobileRevokeDeviceInputSchema>

export type RuntimeMobileRevokeDeviceResult = {
  revoked: boolean
}

export type RuntimeMobileWebSocketReadyResult = {
  ready: boolean
  endpoint: string | null
}

export const MobileHostPairingEmptyInputSchema = z.object({})

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
// Why: minting/rotating a pairing offer and revoking a paired device both
// write to this host's device registry — host tier, not read.
const HOST_HOST_ACCESS = { scope: 'host', tier: 'host' } as const

export const mobileHostPairingContract = {
  listNetworkInterfaces: withAccess(HOST_READ_ACCESS)
    .input(MobileHostPairingEmptyInputSchema)
    .output(type<RuntimeMobileListNetworkInterfacesResult>()),
  getPairingQR: withAccess(HOST_HOST_ACCESS)
    .input(MobileHostPairingQRInputSchema)
    .output(type<RuntimeMobilePairingQRResult>()),
  listDevices: withAccess(HOST_READ_ACCESS)
    .input(MobileHostPairingEmptyInputSchema)
    .output(type<RuntimeMobileListDevicesResult>()),
  revokeDevice: withAccess(HOST_HOST_ACCESS)
    .input(MobileRevokeDeviceInputSchema)
    .output(type<RuntimeMobileRevokeDeviceResult>()),
  isWebSocketReady: withAccess(HOST_READ_ACCESS)
    .input(MobileHostPairingEmptyInputSchema)
    .output(type<RuntimeMobileWebSocketReadyResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
