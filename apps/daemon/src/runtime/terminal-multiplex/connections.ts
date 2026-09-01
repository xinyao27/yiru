import { createHash, randomBytes } from 'node:crypto'

import { decodeRuntimeOrpcSideChannelBinaryFrame } from '@yiru/runtime-protocol/orpc-peer-frame'
import {
  decodeTerminalMultiplexFrame,
  TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES,
  type TerminalMultiplexFrame
} from '@yiru/runtime-protocol/terminal-multiplex/frame'

import { recordTerminalMultiplexAdmissionEvent } from './telemetry'

const BULK_TICKET_TTL_MS = 30_000

type Ticket = {
  principalId: string
  clientInstanceId: string
  environmentId: string
  bulkEndpoint: string
  expiresAt: number
}

export type TerminalMultiplexIdentity = Pick<
  Ticket,
  'principalId' | 'clientInstanceId' | 'environmentId'
>

type TerminalMultiplexHandler = (frame: TerminalMultiplexFrame) => void
type CloseConnection = (code: number, reason: string) => void

export class TerminalMultiplexConnections {
  private readonly tickets = new Map<string, Ticket>()
  private readonly connectionUse = new Map<string, 'control' | 'bulk'>()
  private readonly bulkIdentity = new Map<string, TerminalMultiplexIdentity>()
  private readonly requestIds = new Map<string, string>()
  private readonly handlers = new Map<string, Map<number, TerminalMultiplexHandler>>()
  private readonly activeOwners = new Map<
    string,
    { connectionId: string; close: CloseConnection }
  >()

  issueTicket(
    principalId: string,
    clientInstanceId: string,
    environmentId: string,
    bulkEndpoint: string
  ): { bulkTicket: string; bulkEndpoint: string; expiresAt: number; maxFrameBytes: number } {
    // Why: docs/reference/terminal-multiplex.md OQ-4 defers relay QoS. This release isolates
    // bulk on a dedicated admitted connection without inspecting encrypted opcodes.
    this.pruneTickets()
    const bulkTicket = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + BULK_TICKET_TTL_MS
    this.tickets.set(ticketDigest(bulkTicket), {
      principalId,
      clientInstanceId,
      environmentId,
      bulkEndpoint,
      expiresAt
    })
    return {
      bulkTicket,
      bulkEndpoint,
      expiresAt,
      maxFrameBytes: TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES
    }
  }

  admitInvocation(
    connectionId: string,
    method: string,
    input: unknown,
    principalId: string,
    requestId = ''
  ): 'accepted' | 'connection_use_conflict' | 'invalid_bulk_ticket' {
    const requestedUse = method === 'terminal.multiplex' ? 'bulk' : 'control'
    const currentUse = this.connectionUse.get(connectionId)
    if (currentUse) {
      if (currentUse === 'control' && requestedUse === 'control') {
        return 'accepted'
      }
      recordTerminalMultiplexAdmissionEvent('connection_use_conflict')
      return 'connection_use_conflict'
    }
    if (requestedUse === 'control') {
      this.connectionUse.set(connectionId, 'control')
      return 'accepted'
    }
    const bulkTicket = readBulkTicket(input)
    const ticket = bulkTicket ? this.redeemTicket(bulkTicket, principalId) : null
    if (!ticket) {
      recordTerminalMultiplexAdmissionEvent('invalid_bulk_ticket')
      return 'invalid_bulk_ticket'
    }
    this.connectionUse.set(connectionId, 'bulk')
    this.bulkIdentity.set(connectionId, ticket)
    this.requestIds.set(connectionId, requestId)
    return 'accepted'
  }

  activateEpoch(connectionId: string, close: CloseConnection): boolean {
    const identity = this.bulkIdentity.get(connectionId)
    if (!identity) {
      return false
    }
    const ownerKey = `${identity.principalId}\u0000${identity.clientInstanceId}\u0000${identity.environmentId}`
    const previous = this.activeOwners.get(ownerKey)
    this.activeOwners.set(ownerKey, { connectionId, close })
    if (previous && previous.connectionId !== connectionId) {
      recordTerminalMultiplexAdmissionEvent('owner_superseded')
      previous.close(4001, 'superseded')
    }
    return true
  }

  register(connectionId: string, routeId: number, handler: TerminalMultiplexHandler): () => void {
    if (!connectionId || !Number.isInteger(routeId) || routeId < 0) {
      return () => {}
    }
    let connectionHandlers = this.handlers.get(connectionId)
    if (!connectionHandlers) {
      connectionHandlers = new Map()
      this.handlers.set(connectionId, connectionHandlers)
    }
    connectionHandlers.set(routeId, handler)
    return () => {
      const current = this.handlers.get(connectionId)
      if (current?.get(routeId) !== handler) {
        return
      }
      current.delete(routeId)
      if (current.size === 0) {
        this.handlers.delete(connectionId)
      }
    }
  }

  handle(connectionId: string, bytes: Uint8Array<ArrayBufferLike>): boolean {
    const outer = decodeRuntimeOrpcSideChannelBinaryFrame(bytes)
    if (!outer || outer.requestId !== this.requestIds.get(connectionId)) {
      return false
    }
    const decoded = decodeTerminalMultiplexFrame(outer.payload)
    if (!decoded.ok) {
      recordTerminalMultiplexAdmissionEvent(`frame_rejected.${decoded.error.code}`)
      return false
    }
    const connectionHandlers = this.handlers.get(connectionId)
    const handler = connectionHandlers?.get(decoded.frame.routeId) ?? connectionHandlers?.get(0)
    if (!handler) {
      return false
    }
    handler(decoded.frame)
    return true
  }

  closeConnection(connectionId: string): void {
    this.handlers.delete(connectionId)
    this.connectionUse.delete(connectionId)
    this.bulkIdentity.delete(connectionId)
    this.requestIds.delete(connectionId)
    for (const [ownerKey, owner] of this.activeOwners) {
      if (owner.connectionId === connectionId) {
        this.activeOwners.delete(ownerKey)
      }
    }
  }

  private redeemTicket(bulkTicket: string, principalId: string): TerminalMultiplexIdentity | null {
    this.pruneTickets()
    const digest = ticketDigest(bulkTicket)
    const ticket = this.tickets.get(digest)
    this.tickets.delete(digest)
    if (!ticket || ticket.expiresAt < Date.now() || ticket.principalId !== principalId) {
      return null
    }
    return {
      principalId: ticket.principalId,
      clientInstanceId: ticket.clientInstanceId,
      environmentId: ticket.environmentId
    }
  }

  private pruneTickets(): void {
    const now = Date.now()
    for (const [digest, ticket] of this.tickets) {
      if (ticket.expiresAt < now) {
        this.tickets.delete(digest)
      }
    }
  }
}

function ticketDigest(ticket: string): string {
  return createHash('sha256').update(ticket).digest('base64url')
}

function readBulkTicket(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }
  const keys = Object.keys(input)
  if (keys.length !== 1 || keys[0] !== 'bulkTicket') {
    return null
  }
  const ticket = Reflect.get(input, 'bulkTicket')
  return typeof ticket === 'string' && ticket.length > 0 ? ticket : null
}
