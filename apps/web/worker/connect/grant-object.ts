import {
  BrowserCancelGrantRequestSchema,
  BrowserGrantStatusRequestSchema,
  ConfirmConnectGrantRequestSchema,
  ExchangeConnectGrantRequestSchema,
  WEB_CONNECT_PROTOCOL_VERSION,
  WEB_CONNECT_REQUEST_CLOCK_SKEW_MS
} from '@yiru/runtime-protocol/web-connect'
import {
  browserCancelGrantSigningMessage,
  browserStatusSigningMessage,
  machineConfirmationSigningMessage,
  pairingVerificationMessage
} from '@yiru/runtime-protocol/web-connect/signing-messages'

import { base64UrlToBytes, randomBase64Url, sha256Base64Url } from './encoding'
import type { WebWorkerEnvironment } from './environment'
import { readCreateGrantRecord, readStoredGrant, type ConnectGrantRecord } from './grant-record'
import {
  deriveVerificationCode,
  fixedLengthEqual,
  isCurrentBrowserRequest,
  trimNonces
} from './grant-security'
import { apiError, jsonResponse } from './responses'

const GRANT_STORAGE_KEY = 'grant'

export class ConnectGrantObject {
  private readonly state: DurableObjectState
  private readonly env: WebWorkerEnvironment

  constructor(state: DurableObjectState, env: WebWorkerEnvironment) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname
    if (request.method === 'PUT' && pathname.endsWith('/internal/create')) {
      return await this.create(request)
    }
    if (request.method === 'DELETE' && /\/grants\/[A-Za-z0-9_-]+$/.test(pathname)) {
      return await this.cancel(request)
    }
    if (request.method !== 'POST') {
      return apiError('method_not_allowed', 405)
    }
    if (pathname.endsWith('/exchange')) {
      return await this.exchange(request)
    }
    if (pathname.endsWith('/confirm')) {
      return await this.confirm(request)
    }
    if (pathname.endsWith('/status')) {
      return await this.status(request)
    }
    return apiError('not_found', 404)
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll()
  }

  private async create(request: Request): Promise<Response> {
    if (await this.readGrant()) {
      return apiError('grant_already_exists', 409)
    }
    const input = readCreateGrantRecord(await request.json())
    if (!input) {
      return apiError('invalid_request', 400)
    }
    const grant: ConnectGrantRecord = {
      browser: input.browser,
      secretHash: input.secretHash,
      expiresAt: input.expiresAt,
      usedBrowserNonces: {},
      pendingMachine: null,
      pairedAt: null
    }
    await this.state.storage.put(GRANT_STORAGE_KEY, grant)
    await this.state.storage.setAlarm(grant.expiresAt)
    return jsonResponse({ ok: true })
  }

  private async cancel(request: Request): Promise<Response> {
    const grant = await this.readGrant()
    if (!grant) {
      return jsonResponse({ ok: true })
    }
    const parsed = BrowserCancelGrantRequestSchema.safeParse(await request.json())
    if (!parsed.success || !isCurrentBrowserRequest(grant, parsed.data)) {
      return apiError('invalid_request', 400)
    }
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      grant.browser.signingKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlToBytes(parsed.data.signature),
      new TextEncoder().encode(
        browserCancelGrantSigningMessage({
          grantId: this.grantIdFromCancel(request),
          timestamp: parsed.data.timestamp,
          nonce: parsed.data.nonce
        })
      )
    )
    if (!isValid) {
      return apiError('invalid_signature', 401)
    }
    if (grant.pairedAt === null) {
      await this.state.storage.deleteAll()
    }
    return jsonResponse({ ok: true })
  }

  private async exchange(request: Request): Promise<Response> {
    const grant = await this.readActiveGrant()
    if (grant instanceof Response) {
      return grant
    }
    if (grant.pairedAt !== null || grant.pendingMachine !== null) {
      return apiError('grant_already_used', 409)
    }
    const parsed = ExchangeConnectGrantRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return apiError('invalid_request', 400)
    }
    const secretHash = await sha256Base64Url(parsed.data.secret)
    if (!fixedLengthEqual(secretHash, grant.secretHash)) {
      return apiError('invalid_grant', 401)
    }
    const machineId = await sha256Base64Url(parsed.data.machine.signingKey.x)
    const verificationCode = await deriveVerificationCode(
      pairingVerificationMessage({
        grantId: this.grantId(request),
        browser: grant.browser,
        machineSigningKey: parsed.data.machine.signingKey
      })
    )
    grant.pendingMachine = {
      id: machineId,
      name: parsed.data.machine.name,
      signingKey: parsed.data.machine.signingKey,
      challenge: randomBase64Url(32),
      verificationCode
    }
    await this.state.storage.put(GRANT_STORAGE_KEY, grant)
    return jsonResponse({
      version: WEB_CONNECT_PROTOCOL_VERSION,
      grantId: this.grantId(request),
      machineId,
      challenge: grant.pendingMachine.challenge,
      verificationCode,
      expiresAt: grant.expiresAt,
      browser: grant.browser
    })
  }

  private async confirm(request: Request): Promise<Response> {
    const grant = await this.readActiveGrant()
    if (grant instanceof Response) {
      return grant
    }
    const machine = grant.pendingMachine
    if (!machine || grant.pairedAt !== null) {
      return apiError('verification_not_pending', 409)
    }
    const parsed = ConfirmConnectGrantRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return apiError('invalid_request', 400)
    }
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      machine.signingKey,
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    const message = machineConfirmationSigningMessage({
      grantId: this.grantId(request),
      machineId: machine.id,
      challenge: machine.challenge,
      verificationCode: machine.verificationCode
    })
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      base64UrlToBytes(parsed.data.signature),
      new TextEncoder().encode(message)
    )
    if (!isValid) {
      return apiError('invalid_signature', 401)
    }
    grant.pairedAt = Date.now()
    grant.secretHash = ''
    await this.state.storage.put(GRANT_STORAGE_KEY, grant)
    const machineObject = this.env.CONNECT_MACHINES.get(
      this.env.CONNECT_MACHINES.idFromName(`machine:${machine.id}`)
    )
    const authorization = await machineObject.fetch(
      new Request(`https://connect.internal/machines/${machine.id}/internal/authorize`, {
        method: 'PUT',
        body: JSON.stringify({
          machine: { id: machine.id, signingKey: machine.signingKey },
          browser: grant.browser
        })
      })
    )
    if (!authorization.ok) {
      grant.pairedAt = null
      await this.state.storage.put(GRANT_STORAGE_KEY, grant)
      return apiError('machine_authorization_failed', 500)
    }
    return jsonResponse({
      version: WEB_CONNECT_PROTOCOL_VERSION,
      machineId: machine.id,
      browser: grant.browser
    })
  }

  private async status(request: Request): Promise<Response> {
    const grant = await this.readGrant()
    if (!grant) {
      return apiError('grant_not_found', 404)
    }
    const parsed = BrowserGrantStatusRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return apiError('invalid_request', 400)
    }
    const now = Date.now()
    if (Math.abs(now - parsed.data.timestamp) > WEB_CONNECT_REQUEST_CLOCK_SKEW_MS) {
      return apiError('request_expired', 401)
    }
    if (grant.usedBrowserNonces[parsed.data.nonce] !== undefined) {
      return apiError('replayed_request', 401)
    }
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      grant.browser.signingKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    const message = browserStatusSigningMessage({
      grantId: this.grantId(request),
      timestamp: parsed.data.timestamp,
      nonce: parsed.data.nonce
    })
    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlToBytes(parsed.data.signature),
      new TextEncoder().encode(message)
    )
    if (!isValid) {
      return apiError('invalid_signature', 401)
    }
    grant.usedBrowserNonces[parsed.data.nonce] = now
    grant.usedBrowserNonces = trimNonces(grant.usedBrowserNonces)
    await this.state.storage.put(GRANT_STORAGE_KEY, grant)
    if (now >= grant.expiresAt) {
      return jsonResponse({
        version: WEB_CONNECT_PROTOCOL_VERSION,
        status: 'expired',
        expiresAt: grant.expiresAt
      })
    }
    const machine = grant.pendingMachine
    if (!machine) {
      return jsonResponse({
        version: WEB_CONNECT_PROTOCOL_VERSION,
        status: 'waiting',
        expiresAt: grant.expiresAt
      })
    }
    return jsonResponse({
      version: WEB_CONNECT_PROTOCOL_VERSION,
      status: grant.pairedAt === null ? 'verification-required' : 'paired',
      expiresAt: grant.expiresAt,
      machineId: machine.id,
      machineName: machine.name,
      ...(grant.pairedAt === null
        ? { machineSigningKey: machine.signingKey, verificationCode: machine.verificationCode }
        : { machineSigningKey: machine.signingKey })
    })
  }

  private async readGrant(): Promise<ConnectGrantRecord | null> {
    return readStoredGrant(await this.state.storage.get<unknown>(GRANT_STORAGE_KEY))
  }

  private async readActiveGrant(): Promise<ConnectGrantRecord | Response> {
    const grant = await this.readGrant()
    if (!grant) {
      return apiError('grant_not_found', 404)
    }
    return Date.now() >= grant.expiresAt ? apiError('grant_expired', 410) : grant
  }

  private grantId(request: Request): string {
    const parts = new URL(request.url).pathname.split('/')
    return parts.at(-2) ?? ''
  }

  private grantIdFromCancel(request: Request): string {
    return new URL(request.url).pathname.split('/').at(-1) ?? ''
  }
}
