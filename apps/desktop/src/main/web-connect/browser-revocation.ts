import { createPublicKey, verify } from 'node:crypto'

import {
  RelayBrowserRevokedSchema,
  type RelayBrowserRevoked
} from '@yiru/runtime-protocol/web-connect/relay-frames'
import { browserSelfRevokeSigningMessage } from '@yiru/runtime-protocol/web-connect/signing-messages'

import type { ConnectIdentityStore } from './identity'

export function applyBrowserRevocationFrame(store: ConnectIdentityStore, value: string): boolean {
  const revoked = parseBrowserRevoked(value)
  if (!revoked) {
    return false
  }
  applyBrowserRevocation(store, revoked)
  return true
}

function parseBrowserRevoked(value: string): RelayBrowserRevoked | null {
  try {
    const parsed = RelayBrowserRevokedSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function applyBrowserRevocation(store: ConnectIdentityStore, revoked: RelayBrowserRevoked): void {
  const access = store
    .listPairedBrowserAccess()
    .find(
      (entry) =>
        entry.machineId === revoked.machineId &&
        store.browserAccessId(entry.browser) === revoked.browserId
    )
  if (!access) {
    return
  }
  try {
    const key = createPublicKey({ key: access.browser.signingKey, format: 'jwk' })
    const valid = verify(
      'sha256',
      Buffer.from(
        browserSelfRevokeSigningMessage({
          machineId: revoked.machineId,
          browserId: revoked.browserId,
          timestamp: revoked.request.timestamp,
          nonce: revoked.request.nonce
        })
      ),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(revoked.request.signature, 'base64url')
    )
    if (valid) {
      store.removePairedBrowserAccess(revoked.browserId)
    }
  } catch {
    // Why: malformed stored key material must fail closed without taking the foreground relay down.
  }
}
