import {
  BrowserMachineTicketRequestSchema,
  BrowserSelfRevokeRequestSchema,
  RevokeBrowserAccessRequestSchema,
  WEB_CONNECT_PROTOCOL_VERSION,
  browserTicketSigningMessage,
  type BrowserIdentity,
  type MachineSigningKey
} from '@yiru/runtime-protocol/web-connect'

import { randomBase64Url } from './encoding'
import {
  browserIdentityId,
  findSigningBrowser,
  isCurrentTimestamp,
  verifyBrowserRevocation,
  verifyMachineRevocation
} from './machine-authentication'
import {
  MACHINE_STORAGE_KEY,
  readMachine,
  TICKET_TTL_MS,
  trimEphemeralRecord,
  type MachineRecord
} from './machine-record'
import { MachineRelay } from './machine-relay'
import { apiError, jsonResponse } from './responses'

export class ConnectMachineObject {
  private readonly state: DurableObjectState
  private readonly relay: MachineRelay

  constructor(state: DurableObjectState) {
    this.state = state
    this.relay = new MachineRelay(state)
  }

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname
    if (request.method === 'PUT' && pathname.endsWith('/internal/authorize')) {
      return await this.authorize(request)
    }
    if (request.method === 'POST' && pathname.endsWith('/ticket')) {
      return await this.issueTicket(request)
    }
    if (request.method === 'POST' && pathname.endsWith('/revoke')) {
      return await this.revokeBrowser(request)
    }
    if (
      request.headers.get('Upgrade')?.toLowerCase() === 'websocket' &&
      pathname.endsWith('/socket')
    ) {
      return this.relay.acceptSocket()
    }
    return apiError('not_found', 404)
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.relay.receive(socket, message)
  }

  webSocketClose(socket: WebSocket): void {
    this.relay.disconnected(socket)
  }

  webSocketError(): void {}

  private async authorize(request: Request): Promise<Response> {
    const input = (await request.json()) as {
      machine: { id: string; signingKey: MachineSigningKey }
      browser: BrowserIdentity
    }
    const browserId = await browserIdentityId(input.browser)
    const existing = await readMachine(this.state)
    if (existing && existing.machine.id !== input.machine.id) {
      return apiError('machine_identity_conflict', 409)
    }
    const record: MachineRecord = existing ?? {
      machine: input.machine,
      browsers: [],
      tickets: {},
      usedNonces: {}
    }
    record.browsers = [
      { id: browserId, identity: input.browser },
      ...record.browsers.filter((browser) => browser.id !== browserId)
    ]
    await this.state.storage.put(MACHINE_STORAGE_KEY, record)
    return jsonResponse({ ok: true })
  }

  private async issueTicket(request: Request): Promise<Response> {
    const record = await readMachine(this.state)
    if (!record) {
      return apiError('machine_not_found', 404)
    }
    const parsed = BrowserMachineTicketRequestSchema.safeParse(await request.json())
    if (!parsed.success || !isCurrentTimestamp(parsed.data.timestamp)) {
      return apiError('invalid_request', 400)
    }
    if (record.usedNonces[parsed.data.nonce] !== undefined) {
      return apiError('replayed_request', 401)
    }
    const message = browserTicketSigningMessage({
      machineId: record.machine.id,
      timestamp: parsed.data.timestamp,
      nonce: parsed.data.nonce
    })
    const browser = await findSigningBrowser(record.browsers, message, parsed.data.signature)
    if (!browser) {
      return apiError('invalid_signature', 401)
    }
    const runtimePublicKeyB64 = this.relay.runtimePublicKey()
    if (!runtimePublicKeyB64) {
      return apiError('machine_offline', 409)
    }
    const ticket = randomBase64Url(32)
    const expiresAt = Date.now() + TICKET_TTL_MS
    record.tickets[ticket] = { browserId: browser.id, expiresAt }
    record.usedNonces[parsed.data.nonce] = Date.now()
    trimEphemeralRecord(record.tickets)
    trimEphemeralRecord(record.usedNonces)
    await this.state.storage.put(MACHINE_STORAGE_KEY, record)
    return jsonResponse({
      version: WEB_CONNECT_PROTOCOL_VERSION,
      ticket,
      expiresAt,
      socketPath: `/api/connect/machines/${record.machine.id}/socket`,
      runtimePublicKeyB64
    })
  }

  private async revokeBrowser(request: Request): Promise<Response> {
    const record = await readMachine(this.state)
    const input: unknown = await request.json()
    const machineRequest = RevokeBrowserAccessRequestSchema.safeParse(input)
    const browserRequest = BrowserSelfRevokeRequestSchema.safeParse(input)
    const requestAuth = machineRequest.success
      ? machineRequest.data
      : browserRequest.success
        ? browserRequest.data
        : null
    const browserId = new URL(request.url).pathname.split('/').at(-2) ?? ''
    if (!record || !requestAuth || !isCurrentTimestamp(requestAuth.timestamp)) {
      return apiError('invalid_request', 400)
    }
    if (record.usedNonces[requestAuth.nonce] !== undefined) {
      return apiError('replayed_request', 401)
    }
    const valid = machineRequest.success
      ? await verifyMachineRevocation(record.machine, browserId, machineRequest.data)
      : browserRequest.success
        ? await verifyBrowserRevocation(
            record.machine.id,
            record.browsers,
            browserId,
            browserRequest.data
          )
        : false
    if (!valid) {
      return apiError('invalid_signature', 401)
    }
    record.browsers = record.browsers.filter((browser) => browser.id !== browserId)
    record.usedNonces[requestAuth.nonce] = Date.now()
    trimEphemeralRecord(record.usedNonces)
    await this.state.storage.put(MACHINE_STORAGE_KEY, record)
    this.relay.closeBrowserAccess(browserId)
    return jsonResponse({ ok: true })
  }
}
