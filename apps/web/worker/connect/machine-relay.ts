import {
  BrowserRelayAuthSchema,
  MachineRelayAuthSchema,
  WEB_CONNECT_MAX_RELAY_FRAME_BYTES,
  WEB_CONNECT_PROTOCOL_VERSION,
  browserRelayAuthSigningMessage,
  machineRelayAuthSigningMessage
} from '@yiru/runtime-protocol/web-connect'
import {
  RelayConnectionCloseSchema,
  WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES
} from '@yiru/runtime-protocol/web-connect/relay-frames'

import { base64UrlToBytes, randomBase64Url } from './encoding'
import { isCurrentTimestamp, verifyBrowserSignature } from './machine-authentication'
import { MACHINE_STORAGE_KEY, readMachine, trimEphemeralRecord } from './machine-record'
import {
  decodeRelayFrame,
  encodeRelayFrame,
  relayMessageByteLength,
  sendRelayFrame
} from './relay-frame'

type RelayAttachment =
  | { role: 'pending' }
  | { role: 'machine'; runtimePublicKeyB64: string }
  | { role: 'browser'; browserId: string; connectionId: string }

const MAX_BROWSER_CONNECTIONS = 8

export class MachineRelay {
  private readonly state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  acceptSocket(): Response {
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.serializeAttachment({ role: 'pending' } satisfies RelayAttachment)
    this.state.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async receive(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as RelayAttachment | null
    const maxBytes =
      attachment?.role === 'machine'
        ? WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES
        : WEB_CONNECT_MAX_RELAY_FRAME_BYTES
    if (relayMessageByteLength(message) > maxBytes) {
      socket.close(1009, 'Relay frame is too large')
      return
    }
    if (!attachment || attachment.role === 'pending') {
      if (typeof message === 'string') {
        await this.authenticateSocket(socket, message)
      } else {
        socket.close(1008, 'Authentication required')
      }
      return
    }
    if (attachment.role === 'machine') {
      if (typeof message !== 'string' || !this.forwardMachineMessage(message)) {
        socket.close(1008, 'Invalid relay frame')
      }
      return
    }
    const machine = this.machineSocket()
    if (machine) {
      sendRelayFrame(machine, JSON.stringify(encodeRelayFrame(attachment.connectionId, message)))
    }
  }

  disconnected(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as RelayAttachment | null
    if (attachment?.role === 'machine') {
      for (const browser of this.browserSockets()) {
        browser.close(1012, 'Machine offline')
      }
    } else if (attachment?.role === 'browser') {
      this.sendConnectionClose(attachment.connectionId)
    }
  }

  runtimePublicKey(): string | null {
    const attachment = this.machineSocket()?.deserializeAttachment() as RelayAttachment | null
    return attachment?.role === 'machine' ? attachment.runtimePublicKeyB64 : null
  }

  closeBrowserAccess(browserId: string): void {
    for (const socket of this.browserSockets()) {
      const attachment = socket.deserializeAttachment() as RelayAttachment | null
      if (attachment?.role === 'browser' && attachment.browserId === browserId) {
        socket.close(1008, 'Access revoked')
      }
    }
  }

  private async authenticateSocket(socket: WebSocket, raw: string): Promise<void> {
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      socket.close(1008, 'Invalid authentication')
      return
    }
    const machineAuth = MachineRelayAuthSchema.safeParse(value)
    if (machineAuth.success) {
      await this.authenticateMachine(socket, machineAuth.data)
      return
    }
    const browserAuth = BrowserRelayAuthSchema.safeParse(value)
    if (browserAuth.success) {
      await this.authenticateBrowser(socket, browserAuth.data)
      return
    }
    socket.close(1008, 'Invalid authentication')
  }

  private async authenticateMachine(
    socket: WebSocket,
    auth: ReturnType<typeof MachineRelayAuthSchema.parse>
  ): Promise<void> {
    const record = await readMachine(this.state)
    if (!record || record.machine.id !== auth.machineId || !isCurrentTimestamp(auth.timestamp)) {
      socket.close(1008, 'Unauthorized')
      return
    }
    const key = await crypto.subtle.importKey('jwk', record.machine.signingKey, 'Ed25519', false, [
      'verify'
    ])
    if (record.usedNonces[auth.nonce] !== undefined) {
      socket.close(1008, 'Replayed authentication')
      return
    }
    const valid = await crypto.subtle.verify(
      'Ed25519',
      key,
      base64UrlToBytes(auth.signature),
      new TextEncoder().encode(machineRelayAuthSigningMessage(auth))
    )
    if (!valid) {
      socket.close(1008, 'Unauthorized')
      return
    }
    record.usedNonces[auth.nonce] = Date.now()
    trimEphemeralRecord(record.usedNonces)
    await this.state.storage.put(MACHINE_STORAGE_KEY, record)
    this.machineSocket()?.close(1012, 'Machine reconnected')
    for (const browser of this.browserSockets()) {
      browser.close(1012, 'Machine reconnected')
    }
    socket.serializeAttachment({
      role: 'machine',
      runtimePublicKeyB64: auth.runtimePublicKeyB64
    } satisfies RelayAttachment)
    sendRelayFrame(socket, JSON.stringify({ type: 'machine-ready' }))
  }

  private async authenticateBrowser(
    socket: WebSocket,
    auth: ReturnType<typeof BrowserRelayAuthSchema.parse>
  ): Promise<void> {
    const record = await readMachine(this.state)
    const ticket = record?.tickets[auth.ticket]
    if (
      !record ||
      record.machine.id !== auth.machineId ||
      !ticket ||
      ticket.expiresAt < Date.now() ||
      !isCurrentTimestamp(auth.timestamp)
    ) {
      socket.close(1008, 'Unauthorized')
      return
    }
    const browser = record.browsers.find((candidate) => candidate.id === ticket.browserId)
    if (
      !browser ||
      !(await verifyBrowserSignature(
        browser.identity,
        browserRelayAuthSigningMessage(auth),
        auth.signature
      ))
    ) {
      socket.close(1008, 'Unauthorized')
      return
    }
    delete record.tickets[auth.ticket]
    await this.state.storage.put(MACHINE_STORAGE_KEY, record)
    if (this.browserSockets().length >= MAX_BROWSER_CONNECTIONS) {
      socket.close(1013, 'Too many browser connections')
      return
    }
    const machine = this.machineSocket()
    if (!machine) {
      socket.close(1013, 'Machine offline')
      return
    }
    const connectionId = randomBase64Url(18)
    socket.serializeAttachment({
      role: 'browser',
      browserId: browser.id,
      connectionId
    } satisfies RelayAttachment)
    sendRelayFrame(
      machine,
      JSON.stringify({
        type: 'relay-browser-auth',
        connectionId,
        auth,
        browser: browser.identity
      })
    )
  }

  private forwardMachineMessage(raw: string): boolean {
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      return false
    }
    const close = RelayConnectionCloseSchema.safeParse(value)
    if (close.success) {
      this.browserSocket(close.data.connectionId)?.close(1012, 'Runtime connection closed')
      return true
    }
    const frame = decodeRelayFrame(raw)
    if (!frame) {
      return false
    }
    const browser = this.browserSocket(frame.connectionId)
    if (browser) {
      sendRelayFrame(browser, frame.message)
    }
    return true
  }

  private sendConnectionClose(connectionId: string): void {
    const machine = this.machineSocket()
    if (machine) {
      sendRelayFrame(
        machine,
        JSON.stringify({
          type: 'relay-connection-close',
          version: WEB_CONNECT_PROTOCOL_VERSION,
          connectionId
        })
      )
    }
  }

  private machineSocket(): WebSocket | null {
    return (
      this.state
        .getWebSockets()
        .find(
          (socket) =>
            socket.readyState === WebSocket.OPEN &&
            (socket.deserializeAttachment() as RelayAttachment | null)?.role === 'machine'
        ) ?? null
    )
  }

  private browserSockets(): WebSocket[] {
    return this.state
      .getWebSockets()
      .filter(
        (socket) =>
          socket.readyState === WebSocket.OPEN &&
          (socket.deserializeAttachment() as RelayAttachment | null)?.role === 'browser'
      )
  }

  private browserSocket(connectionId: string): WebSocket | null {
    return (
      this.browserSockets().find((socket) => {
        const attachment = socket.deserializeAttachment() as RelayAttachment | null
        return attachment?.role === 'browser' && attachment.connectionId === connectionId
      }) ?? null
    )
  }
}
