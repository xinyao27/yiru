import { z } from 'zod'

const IPV4_OCTET = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
const IPV4_REGEX = new RegExp(`^(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}$`)
const HOSTNAME_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const HOSTNAME_REGEX = new RegExp(`^(?:${HOSTNAME_LABEL}\\.)*${HOSTNAME_LABEL}$`, 'i')
const HOSTNAME_MAX_LENGTH = 253
const MIN_PORT = 1
const MAX_PORT = 65_535

export const MOBILE_DEVELOPMENT_PAIRING_METHOD = 'mobile.developmentPairing'
export const MOBILE_DEVELOPMENT_PAIRING_INVALID_ARGUMENT =
  'Expected a valid --address and non-empty --device-name'

export type ParseManualAddressResult = { ok: true; address: string } | { ok: false; error: string }

export type MobileDevelopmentPairingInput = {
  address: string
  deviceName: string
}

export type MobileDevelopmentPairingResult = {
  pairingUrl: string
  endpoint: string
  deviceId: string
}

export const MobileDevelopmentPairingInputSchema = z
  .unknown()
  .transform((value, context): MobileDevelopmentPairingInput => {
    if (!isRecord(value)) {
      context.addIssue({ code: 'custom', message: MOBILE_DEVELOPMENT_PAIRING_INVALID_ARGUMENT })
      return z.NEVER
    }
    const address = typeof value.address === 'string' ? value.address.trim() : ''
    const deviceName = typeof value.deviceName === 'string' ? value.deviceName.trim() : ''
    if (
      !parseManualNetworkAddress(address).ok ||
      deviceName.length === 0 ||
      deviceName.length > 256
    ) {
      context.addIssue({ code: 'custom', message: MOBILE_DEVELOPMENT_PAIRING_INVALID_ARGUMENT })
      return z.NEVER
    }
    return { address, deviceName }
  })

export type MobileDevelopmentPairingLegacyContract = Readonly<{
  name: typeof MOBILE_DEVELOPMENT_PAIRING_METHOD
  params: typeof MobileDevelopmentPairingInputSchema
  mobile: false
  resultType?: MobileDevelopmentPairingResult
}>

export const MOBILE_DEVELOPMENT_PAIRING_CONTRACT: MobileDevelopmentPairingLegacyContract = {
  name: MOBILE_DEVELOPMENT_PAIRING_METHOD,
  params: MobileDevelopmentPairingInputSchema,
  mobile: false
}

export function parseManualNetworkAddress(input: string): ParseManualAddressResult {
  const trimmed = input.trim()
  if (trimmed === '' || /\s/.test(trimmed)) {
    return invalidAddress()
  }

  const { host, port } = splitHostPort(trimmed)
  if (host === '' || host.length > HOSTNAME_MAX_LENGTH || (port !== null && !isValidPort(port))) {
    return invalidAddress()
  }
  if (IPV4_REGEX.test(host)) {
    return { ok: true, address: trimmed }
  }

  // Why: WHATWG treats a numeric final label as an IPv4 signal. A valid IPv4 was
  // already accepted, so accepting one here could silently resolve a different host.
  const lastLabel = host.split('.').at(-1) ?? ''
  if (/^[0-9]+$/.test(lastLabel) || /^0x[0-9a-f]*$/i.test(lastLabel)) {
    return invalidAddress()
  }
  return HOSTNAME_REGEX.test(host) ? { ok: true, address: trimmed } : invalidAddress()
}

function splitHostPort(value: string): { host: string; port: string | null } {
  const firstColon = value.indexOf(':')
  if (firstColon === -1 || value.includes(':', firstColon + 1)) {
    return { host: value, port: null }
  }
  return { host: value.slice(0, firstColon), port: value.slice(firstColon + 1) }
}

function isValidPort(port: string): boolean {
  if (!/^[1-9][0-9]*$/.test(port)) {
    return false
  }
  const value = Number(port)
  return value >= MIN_PORT && value <= MAX_PORT
}

function invalidAddress(): ParseManualAddressResult {
  return { ok: false, error: MOBILE_DEVELOPMENT_PAIRING_INVALID_ARGUMENT }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
