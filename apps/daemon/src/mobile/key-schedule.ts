import { hkdfSync } from 'node:crypto'

import { MOBILE_E2EE_V2_KDF_DOMAIN } from '@yiru/runtime-protocol/mobile/e2ee-contract'

const SALT_LABEL = new TextEncoder().encode(`${MOBILE_E2EE_V2_KDF_DOMAIN}/salt\0`)
const INFO_LABEL = new TextEncoder().encode(`${MOBILE_E2EE_V2_KDF_DOMAIN}/session\0`)

export type MobileKeySchedule = {
  desktopToMobileKey: Uint8Array
  mobileToDesktopKey: Uint8Array
  sessionId: Uint8Array
  transcriptHash: Uint8Array
}

export function deriveMobileKeySchedule(args: {
  clientNonce: Uint8Array
  desktopNonce: Uint8Array
  sharedSecret: Uint8Array
  transcript: Uint8Array
}): MobileKeySchedule {
  requireLength(args.sharedSecret, 32)
  requireLength(args.clientNonce, 32)
  requireLength(args.desktopNonce, 32)
  const transcriptHash = sha256(args.transcript)
  const salt = sha256(concatBytes([SALT_LABEL, args.clientNonce, args.desktopNonce]))
  const info = concatBytes([INFO_LABEL, transcriptHash])
  const expanded = new Uint8Array(hkdfSync('sha256', args.sharedSecret, salt, info, 96))
  return {
    desktopToMobileKey: expanded.slice(32, 64),
    mobileToDesktopKey: expanded.slice(0, 32),
    sessionId: expanded.slice(64, 96),
    transcriptHash
  }
}

function sha256(bytes: Uint8Array): Uint8Array {
  return new Bun.CryptoHasher('sha256').update(bytes).digest()
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function requireLength(bytes: Uint8Array, expected: number): void {
  if (bytes.length !== expected) {
    throw new Error('mobile_key_schedule_input_invalid')
  }
}
