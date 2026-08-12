import { WEB_CONNECT_REQUEST_CLOCK_SKEW_MS } from '@yiru/runtime-protocol/web-connect'

import type { ConnectGrantRecord } from './grant-record'

const MAX_REMEMBERED_NONCES = 64

export function isCurrentBrowserRequest(
  grant: ConnectGrantRecord,
  input: { timestamp: number; nonce: string }
): boolean {
  return (
    Math.abs(Date.now() - input.timestamp) <= WEB_CONNECT_REQUEST_CLOCK_SKEW_MS &&
    grant.usedBrowserNonces[input.nonce] === undefined
  )
}

export async function deriveVerificationCode(message: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  )
  const value = ((digest[0] << 16) | (digest[1] << 8) | digest[2]) % 1_000_000
  return String(value).padStart(6, '0')
}

export function fixedLengthEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

export function trimNonces(nonces: Record<string, number>): Record<string, number> {
  const entries = Object.entries(nonces).sort((left, right) => right[1] - left[1])
  return Object.fromEntries(entries.slice(0, MAX_REMEMBERED_NONCES))
}
