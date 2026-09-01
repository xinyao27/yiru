import { timingSafeEqual } from 'node:crypto'

import type {
  DangerousApprovalStatus,
  DangerousApprovalOperation
} from '@yiru/runtime-protocol/contract'

import type { DangerousCredentialStore } from './credential-store'

const CHALLENGE_TTL_MS = 2 * 60_000
const GRANT_TTL_MS = 30_000

type PendingCeremony = {
  challenge: string
  expiresAt: number
  operation: string | null
  userId: string | null
}

type CeremonyResponse = {
  authenticatorData?: string
  clientDataJson: string
  credentialId: string
  publicKeySpki?: string
  signature?: string
}

export class DangerousApprovalService {
  private readonly allowedOrigins: ReadonlySet<string>
  private readonly grants = new Map<string, number>()
  private readonly pending = new Map<string, PendingCeremony>()
  private readonly store: DangerousCredentialStore

  constructor(store: DangerousCredentialStore, allowedOrigins: ReadonlySet<string>) {
    this.store = store
    this.allowedOrigins = allowedOrigins
  }

  status(): DangerousApprovalStatus {
    const credential = this.store.read()
    return { configured: credential !== null, credentialId: credential?.credentialId ?? null }
  }

  beginRegistration(): { challenge: string; requestId: string; userId: string } {
    if (this.store.read()) {
      this.consume('security.manage-passkey')
    }
    const requestId = crypto.randomUUID()
    const userId = randomBase64Url(16)
    const challenge = randomBase64Url(32)
    this.pending.set(requestId, {
      challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      operation: null,
      userId
    })
    return { challenge, requestId, userId }
  }

  async finishRegistration(
    requestId: string,
    response: CeremonyResponse
  ): Promise<DangerousApprovalStatus> {
    const pending = this.consumePending(requestId, null)
    if (!response.publicKeySpki || !response.authenticatorData || !pending.userId) {
      throw new Error('dangerous_approval_registration_invalid')
    }
    await validateClientData(
      response.clientDataJson,
      pending.challenge,
      this.allowedOrigins,
      'webauthn.create'
    )
    await validateAuthenticatorData(response.authenticatorData, this.allowedOrigins)
    await importCredentialKey(response.publicKeySpki)
    this.store.save({
      credentialId: response.credentialId,
      publicKeySpki: response.publicKeySpki,
      userId: pending.userId
    })
    return this.status()
  }

  beginApproval(operation: string): { challenge: string; requestId: string } {
    validateOperation(operation)
    if (!this.store.read()) {
      throw new Error('dangerous_approval_not_configured')
    }
    const requestId = crypto.randomUUID()
    const challenge = randomBase64Url(32)
    this.pending.set(requestId, {
      challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      operation,
      userId: null
    })
    return { challenge, requestId }
  }

  async finishApproval(
    requestId: string,
    operation: string,
    response: CeremonyResponse
  ): Promise<{ approvedUntil: number }> {
    validateOperation(operation)
    const pending = this.consumePending(requestId, operation)
    const credential = this.store.read()
    if (
      !credential ||
      credential.credentialId !== response.credentialId ||
      !response.authenticatorData ||
      !response.signature
    ) {
      throw new Error('dangerous_approval_assertion_invalid')
    }
    const clientData = decodeBase64Url(response.clientDataJson)
    await validateClientData(
      response.clientDataJson,
      pending.challenge,
      this.allowedOrigins,
      'webauthn.get'
    )
    const authenticatorData = await validateAuthenticatorData(
      response.authenticatorData,
      this.allowedOrigins
    )
    const signed = copyBytes(
      Buffer.concat([authenticatorData, new Bun.CryptoHasher('sha256').update(clientData).digest()])
    )
    const key = await importCredentialKey(credential.publicKeySpki)
    const valid = await crypto.subtle.verify(
      { hash: 'SHA-256', name: 'ECDSA' },
      key,
      ecdsaDerToRaw(decodeBase64Url(response.signature)),
      signed
    )
    if (!valid) {
      throw new Error('dangerous_approval_signature_invalid')
    }
    const approvedUntil = Date.now() + GRANT_TTL_MS
    this.grants.set(operation, approvedUntil)
    return { approvedUntil }
  }

  consume(operation: DangerousApprovalOperation): void {
    if (!this.store.read()) {
      return
    }
    const expiresAt = this.grants.get(operation) ?? 0
    this.grants.delete(operation)
    if (expiresAt < Date.now()) {
      throw new Error('dangerous_approval_required')
    }
  }

  remove(): DangerousApprovalStatus {
    this.store.remove()
    this.grants.clear()
    this.pending.clear()
    return this.status()
  }

  private consumePending(requestId: string, operation: string | null): PendingCeremony {
    const pending = this.pending.get(requestId)
    this.pending.delete(requestId)
    if (!pending || pending.expiresAt < Date.now() || pending.operation !== operation) {
      throw new Error('dangerous_approval_challenge_invalid')
    }
    return pending
  }
}

async function validateClientData(
  encoded: string,
  expectedChallenge: string,
  allowedOrigins: ReadonlySet<string>,
  expectedType: 'webauthn.create' | 'webauthn.get'
): Promise<void> {
  const value: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)))
  if (
    typeof value !== 'object' ||
    value === null ||
    Reflect.get(value, 'type') !== expectedType ||
    Reflect.get(value, 'challenge') !== expectedChallenge ||
    typeof Reflect.get(value, 'origin') !== 'string' ||
    !allowedOrigins.has(Reflect.get(value, 'origin'))
  ) {
    throw new Error('dangerous_approval_client_data_invalid')
  }
}

async function validateAuthenticatorData(
  encoded: string,
  allowedOrigins: ReadonlySet<string>
): Promise<Uint8Array<ArrayBuffer>> {
  const data = decodeBase64Url(encoded)
  if (data.byteLength < 37 || (data[32] & 0x05) !== 0x05) {
    throw new Error('dangerous_approval_user_verification_required')
  }
  const rpHash = data.subarray(0, 32)
  // Why: Chrome gives an extension its unique RP ID in full `chrome-extension://id` form, matching
  // the client-data origin; applying ordinary website host-only RP rules would reject valid keys.
  const matches = [...allowedOrigins].some((origin) =>
    timingSafeEqual(rpHash, new Bun.CryptoHasher('sha256').update(origin).digest())
  )
  if (!matches) {
    throw new Error('dangerous_approval_rp_mismatch')
  }
  return data
}

async function importCredentialKey(encoded: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    decodeBase64Url(encoded),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )
}

function validateOperation(operation: string): asserts operation is DangerousApprovalOperation {
  if (
    operation !== 'ritual.enable-archive' &&
    operation !== 'security.manage-passkey' &&
    !operation.startsWith('terminal.approve:')
  ) {
    throw new Error('dangerous_approval_operation_invalid')
  }
}

function randomBase64Url(byteLength: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(byteLength))).toBase64({
    alphabet: 'base64url',
    omitPadding: true
  })
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return copyBytes(Buffer.from(value, 'base64url'))
}

function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy
}

function ecdsaDerToRaw(value: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (value[0] !== 0x30 || value[1] !== value.byteLength - 2 || value[2] !== 0x02) {
    throw new Error('dangerous_approval_signature_encoding_invalid')
  }
  const rLength = value[3] ?? 0
  const rStart = 4
  const sTag = rStart + rLength
  if (value[sTag] !== 0x02) {
    throw new Error('dangerous_approval_signature_encoding_invalid')
  }
  const sLength = value[sTag + 1] ?? 0
  const sStart = sTag + 2
  if (sStart + sLength !== value.byteLength) {
    throw new Error('dangerous_approval_signature_encoding_invalid')
  }
  const raw = new Uint8Array(64)
  copyInteger(value.subarray(rStart, sTag), raw.subarray(0, 32))
  copyInteger(value.subarray(sStart), raw.subarray(32))
  return raw
}

function copyInteger(value: Uint8Array, target: Uint8Array): void {
  const normalized = value[0] === 0 ? value.subarray(1) : value
  if (normalized.byteLength === 0 || normalized.byteLength > target.byteLength) {
    throw new Error('dangerous_approval_signature_encoding_invalid')
  }
  target.set(normalized, target.byteLength - normalized.byteLength)
}
