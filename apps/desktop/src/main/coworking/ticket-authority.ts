import { createHash, randomBytes } from 'node:crypto'

import type { CoworkingTicket, CoworkingTicketBinding } from '~shared/coworking/access-contract'
import type { AuthenticatedCoworkingPrincipal } from '~shared/coworking/wire-contract'
import { COWORKING_TICKET_TTL_MS } from '~shared/coworking/wire-contract'

const MAX_OUTSTANDING_COWORKING_TICKETS = 2_048

type StoredCoworkingTicket = {
  binding: CoworkingTicketBinding
  expiresAt: number
}

export type CoworkingTicketAuthorityOptions = {
  now?: () => number
  createTicket?: () => string
}

export class CoworkingTicketAuthority {
  private readonly tickets = new Map<string, StoredCoworkingTicket>()
  private readonly now: () => number
  private readonly createTicket: () => string

  constructor(options: CoworkingTicketAuthorityOptions = {}) {
    this.now = options.now ?? Date.now
    this.createTicket = options.createTicket ?? (() => randomBytes(32).toString('base64url'))
  }

  issue(binding: CoworkingTicketBinding): CoworkingTicket {
    assertClientPublicKey(binding.clientPublicKeyB64)
    this.pruneExpired()
    if (this.tickets.size >= MAX_OUTSTANDING_COWORKING_TICKETS) {
      throw new Error('coworking_ticket_capacity_exceeded')
    }
    const value = this.createUniqueTicket()
    const expiresAt = this.now() + COWORKING_TICKET_TTL_MS
    this.tickets.set(value, { binding: cloneBinding(binding), expiresAt })
    return { value, expiresAt }
  }

  consume(
    ticket: string,
    binding: CoworkingTicketBinding,
    connectionId: string
  ): AuthenticatedCoworkingPrincipal | null {
    const stored = this.tickets.get(ticket)
    if (!stored) {
      return null
    }
    // Why: even a failed binding attempt burns the ticket so it can never be
    // replayed later from the correct node, socket, or channel key.
    this.tickets.delete(ticket)
    if (stored.expiresAt <= this.now() || !bindingsEqual(stored.binding, binding)) {
      return null
    }
    return {
      kind: 'coworking',
      connectionId,
      tailnet: { ...binding.requester },
      channelKeyFingerprint: fingerprintPublicKey(binding.clientPublicKeyB64)
    }
  }

  clear(): void {
    this.tickets.clear()
  }

  private pruneExpired(): void {
    const now = this.now()
    for (const [ticket, stored] of this.tickets) {
      if (stored.expiresAt <= now) {
        this.tickets.delete(ticket)
      }
    }
  }

  private createUniqueTicket(): string {
    for (let attempt = 0; attempt < 4; attempt++) {
      const ticket = this.createTicket()
      if (ticket && !this.tickets.has(ticket)) {
        return ticket
      }
    }
    throw new Error('coworking_ticket_generation_failed')
  }
}

function cloneBinding(binding: CoworkingTicketBinding): CoworkingTicketBinding {
  return { ...binding, requester: { ...binding.requester } }
}

function bindingsEqual(left: CoworkingTicketBinding, right: CoworkingTicketBinding): boolean {
  return (
    left.requester.nodeId === right.requester.nodeId &&
    left.requester.sourceAddress === right.requester.sourceAddress &&
    left.clientPublicKeyB64 === right.clientPublicKeyB64 &&
    left.ownerRuntimeId === right.ownerRuntimeId &&
    left.ownerKeyFingerprint === right.ownerKeyFingerprint &&
    left.protocolVersion === right.protocolVersion
  )
}

function assertClientPublicKey(publicKeyB64: string): void {
  const bytes = Buffer.from(publicKeyB64, 'base64')
  if (bytes.length !== 32 || bytes.toString('base64') !== publicKeyB64) {
    throw new Error('invalid_coworking_client_public_key')
  }
}

function fingerprintPublicKey(publicKeyB64: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('base64url')
}
