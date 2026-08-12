import { createHash, randomBytes, sign } from 'node:crypto'

import {
  ConfirmConnectGrantResponseSchema,
  ExchangeConnectGrantResponseSchema,
  WEB_CONNECT_PROTOCOL_VERSION,
  machineConfirmationSigningMessage,
  pairingVerificationMessage,
  parseConnectGrant,
  revokeBrowserAccessSigningMessage,
  type MachineSigningKey
} from '@yiru/runtime-protocol/web-connect'

import { RuntimeClientError } from '../runtime-client'
import type { MachineIdentity } from './identity'

type ExchangedGrant = {
  grantId: string
  machineId: string
  challenge: string
  verificationCode: string
  expiresAt: number
}

const DEFAULT_CONNECT_ORIGIN = 'https://app.yiru.ai'

export async function exchangeConnectGrant(args: {
  grant: string
  machineName: string
  machineKey: MachineSigningKey
}): Promise<ExchangedGrant> {
  const parsedGrant = parseConnectGrant(args.grant)
  if (!parsedGrant) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Invalid pairing grant. Copy a fresh command from https://app.yiru.ai.'
    )
  }
  const payload = await requestJson(
    `/api/connect/grants/${encodeURIComponent(parsedGrant.grantId)}/exchange`,
    {
      version: WEB_CONNECT_PROTOCOL_VERSION,
      secret: parsedGrant.secret,
      machine: { name: args.machineName, signingKey: args.machineKey }
    }
  )
  const exchanged = ExchangeConnectGrantResponseSchema.parse(payload)
  const expectedCode = deriveVerificationCode(
    pairingVerificationMessage({
      grantId: exchanged.grantId,
      browser: exchanged.browser,
      machineSigningKey: args.machineKey
    })
  )
  if (exchanged.verificationCode !== expectedCode) {
    throw new RuntimeClientError(
      'connect_verification_failed',
      'The pairing service returned an invalid verification code.'
    )
  }
  return exchanged
}

export async function confirmConnectGrant(
  exchanged: ExchangedGrant,
  identity: MachineIdentity
): Promise<{ machineId: string; browser: ConfirmConnectGrantResponse['browser'] }> {
  const message = machineConfirmationSigningMessage(exchanged)
  const signature = sign(null, Buffer.from(message), identity.privateKey).toString('base64url')
  const payload = await requestJson(
    `/api/connect/grants/${encodeURIComponent(exchanged.grantId)}/confirm`,
    { version: WEB_CONNECT_PROTOCOL_VERSION, signature }
  )
  return ConfirmConnectGrantResponseSchema.parse(payload)
}

export async function revokeBrowserAccess(args: {
  machineId: string
  browserId: string
  identity: MachineIdentity
}): Promise<void> {
  const timestamp = Date.now()
  const nonce = randomBytes(18).toString('base64url')
  const message = revokeBrowserAccessSigningMessage({
    machineId: args.machineId,
    browserId: args.browserId,
    timestamp,
    nonce
  })
  const signature = sign(null, Buffer.from(message), args.identity.privateKey).toString('base64url')
  await requestJson(
    `/api/connect/machines/${encodeURIComponent(args.machineId)}/access/${encodeURIComponent(args.browserId)}/revoke`,
    { actor: 'machine', version: WEB_CONNECT_PROTOCOL_VERSION, timestamp, nonce, signature }
  )
}

type ConfirmConnectGrantResponse = ReturnType<typeof ConfirmConnectGrantResponseSchema.parse>

async function requestJson(pathname: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${connectOrigin()}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  })
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new RuntimeClientError('connect_rejected', readApiError(payload))
  }
  return payload
}

function connectOrigin(): string {
  const configured = process.env.YIRU_CONNECT_ORIGIN ?? DEFAULT_CONNECT_ORIGIN
  const url = new URL(configured)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new RuntimeClientError('invalid_environment', 'YIRU_CONNECT_ORIGIN must use HTTPS.')
  }
  return url.origin
}

function readApiError(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return 'The Yiru connection service returned an invalid response.'
  }
  const error = Reflect.get(value, 'error')
  const code = error && typeof error === 'object' ? Reflect.get(error, 'code') : null
  return typeof code === 'string'
    ? `The Yiru connection service rejected the request: ${code}`
    : 'The Yiru connection service rejected the request.'
}

function deriveVerificationCode(message: string): string {
  const digest = createHash('sha256').update(message).digest()
  const value = ((digest[0] << 16) | (digest[1] << 8) | digest[2]) % 1_000_000
  return String(value).padStart(6, '0')
}
