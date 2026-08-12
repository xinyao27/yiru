import {
  BrowserMachineTicketResponseSchema,
  ConnectGrantStatusResponseSchema,
  CreateConnectGrantResponseSchema,
  WEB_CONNECT_PROTOCOL_VERSION,
  browserRelayAuthSigningMessage,
  browserSelfRevokeSigningMessage,
  browserStatusSigningMessage,
  browserTicketSigningMessage,
  pairingVerificationMessage,
  type ConnectGrantStatusResponse
} from '@yiru/runtime-protocol/web-connect'

import { loadOrCreateBrowserIdentity, signBrowserMessage } from './browser-identity'

export type BrowserConnectGrant = {
  grant: string
  grantId: string
  expiresAt: number
}

export type BrowserRelaySession = {
  socketUrl: string
  runtimePublicKeyB64: string
  auth: {
    type: 'browser-auth'
    version: typeof WEB_CONNECT_PROTOCOL_VERSION
    machineId: string
    ticket: string
    timestamp: number
    nonce: string
    e2eePublicKeyB64: string
    signature: string
  }
}

export async function createBrowserConnectGrant(): Promise<BrowserConnectGrant> {
  const identity = await loadOrCreateBrowserIdentity()
  const response = await fetch('/api/connect/grants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: WEB_CONNECT_PROTOCOL_VERSION,
      browser: identity.publicIdentity
    })
  })
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new Error(readApiError(payload))
  }
  return CreateConnectGrantResponseSchema.parse(payload)
}

export async function readBrowserConnectGrantStatus(
  grantId: string
): Promise<ConnectGrantStatusResponse> {
  const identity = await loadOrCreateBrowserIdentity()
  const timestamp = Date.now()
  const nonce = randomBase64Url(18)
  const signature = await signBrowserMessage(
    identity,
    browserStatusSigningMessage({ grantId, timestamp, nonce })
  )
  const response = await fetch(`/api/connect/grants/${encodeURIComponent(grantId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: WEB_CONNECT_PROTOCOL_VERSION,
      timestamp,
      nonce,
      signature
    })
  })
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new Error(readApiError(payload))
  }
  const status = ConnectGrantStatusResponseSchema.parse(payload)
  if (status.status === 'verification-required') {
    const expectedCode = await deriveVerificationCode(
      pairingVerificationMessage({
        grantId,
        browser: identity.publicIdentity,
        machineSigningKey: status.machineSigningKey
      })
    )
    if (status.verificationCode !== expectedCode) {
      throw new Error('The pairing service returned an invalid verification code.')
    }
  }
  return status
}

export async function createBrowserRelaySession(
  machineId: string,
  e2eePublicKeyB64: string
): Promise<BrowserRelaySession> {
  const identity = await loadOrCreateBrowserIdentity()
  const ticketTimestamp = Date.now()
  const ticketNonce = randomBase64Url(18)
  const ticketSignature = await signBrowserMessage(
    identity,
    browserTicketSigningMessage({ machineId, timestamp: ticketTimestamp, nonce: ticketNonce })
  )
  const response = await fetch(`/api/connect/machines/${encodeURIComponent(machineId)}/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: WEB_CONNECT_PROTOCOL_VERSION,
      timestamp: ticketTimestamp,
      nonce: ticketNonce,
      signature: ticketSignature
    })
  })
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new Error(readApiError(payload))
  }
  const ticket = BrowserMachineTicketResponseSchema.parse(payload)
  const socketUrl = new URL(ticket.socketPath, window.location.href)
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  const timestamp = Date.now()
  const nonce = randomBase64Url(18)
  const authWithoutSignature: Omit<BrowserRelaySession['auth'], 'signature'> = {
    type: 'browser-auth' as const,
    version: WEB_CONNECT_PROTOCOL_VERSION,
    machineId,
    ticket: ticket.ticket,
    timestamp,
    nonce,
    e2eePublicKeyB64
  }
  const signature = await signBrowserMessage(
    identity,
    browserRelayAuthSigningMessage(authWithoutSignature)
  )
  return {
    socketUrl: socketUrl.toString(),
    runtimePublicKeyB64: ticket.runtimePublicKeyB64,
    auth: { ...authWithoutSignature, signature }
  }
}

export async function revokeCurrentBrowserAccess(machineId: string): Promise<void> {
  const identity = await loadOrCreateBrowserIdentity()
  const browserId = await browserIdentityId(
    `${identity.publicIdentity.signingKey.x}.${identity.publicIdentity.signingKey.y}`
  )
  const timestamp = Date.now()
  const nonce = randomBase64Url(18)
  const signature = await signBrowserMessage(
    identity,
    browserSelfRevokeSigningMessage({ machineId, browserId, timestamp, nonce })
  )
  const response = await fetch(
    `/api/connect/machines/${encodeURIComponent(machineId)}/access/${encodeURIComponent(browserId)}/revoke`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: 'browser',
        version: WEB_CONNECT_PROTOCOL_VERSION,
        timestamp,
        nonce,
        signature
      })
    }
  )
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new Error(readApiError(payload))
  }
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return bytesToBase64Url(bytes)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function browserIdentityId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToBase64Url(new Uint8Array(digest))
}

function readApiError(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return 'The Yiru connection service returned an invalid response.'
  }
  const error = Reflect.get(value, 'error')
  if (!error || typeof error !== 'object') {
    return 'The Yiru connection service returned an invalid response.'
  }
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : 'The Yiru connection service rejected the request.'
}

async function deriveVerificationCode(message: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  )
  const value = ((digest[0] << 16) | (digest[1] << 8) | digest[2]) % 1_000_000
  return String(value).padStart(6, '0')
}
