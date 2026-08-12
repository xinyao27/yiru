import type {
  BrowserSelfRevokeRequestSchema,
  RevokeBrowserAccessRequestSchema
} from '@yiru/runtime-protocol/web-connect'
import {
  WEB_CONNECT_REQUEST_CLOCK_SKEW_MS,
  type BrowserIdentity,
  type MachineSigningKey
} from '@yiru/runtime-protocol/web-connect'
import {
  browserSelfRevokeSigningMessage,
  revokeBrowserAccessSigningMessage
} from '@yiru/runtime-protocol/web-connect/signing-messages'

import { base64UrlToBytes, sha256Base64Url } from './encoding'

type AuthorizedBrowser = { id: string; identity: BrowserIdentity }

export async function browserIdentityId(browser: BrowserIdentity): Promise<string> {
  return await sha256Base64Url(`${browser.signingKey.x}.${browser.signingKey.y}`)
}

export async function findSigningBrowser(
  browsers: AuthorizedBrowser[],
  message: string,
  signature: string
): Promise<AuthorizedBrowser | null> {
  for (const browser of browsers) {
    if (await verifyBrowserSignature(browser.identity, message, signature)) {
      return browser
    }
  }
  return null
}

export async function verifyBrowserSignature(
  browser: BrowserIdentity,
  message: string,
  signature: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'jwk',
    browser.signingKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )
  return await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64UrlToBytes(signature),
    new TextEncoder().encode(message)
  )
}

export async function verifyMachineRevocation(
  machine: { id: string; signingKey: MachineSigningKey },
  browserId: string,
  request: ReturnType<typeof RevokeBrowserAccessRequestSchema.parse>
): Promise<boolean> {
  const key = await crypto.subtle.importKey('jwk', machine.signingKey, 'Ed25519', false, ['verify'])
  return await crypto.subtle.verify(
    'Ed25519',
    key,
    base64UrlToBytes(request.signature),
    new TextEncoder().encode(
      revokeBrowserAccessSigningMessage({
        machineId: machine.id,
        browserId,
        timestamp: request.timestamp,
        nonce: request.nonce
      })
    )
  )
}

export async function verifyBrowserRevocation(
  machineId: string,
  browsers: AuthorizedBrowser[],
  browserId: string,
  request: ReturnType<typeof BrowserSelfRevokeRequestSchema.parse>
): Promise<boolean> {
  const browser = browsers.find((candidate) => candidate.id === browserId)
  return browser
    ? await verifyBrowserSignature(
        browser.identity,
        browserSelfRevokeSigningMessage({
          machineId,
          browserId,
          timestamp: request.timestamp,
          nonce: request.nonce
        }),
        request.signature
      )
    : false
}

export function isCurrentTimestamp(timestamp: number): boolean {
  return Math.abs(Date.now() - timestamp) <= WEB_CONNECT_REQUEST_CLOCK_SKEW_MS
}
