import { createHash, randomBytes } from 'node:crypto'
import type { SpoolTicket, SpoolTicketBinding } from '../../shared/spool/spool-access-contract'
import type { AuthenticatedSpoolPrincipal } from '../../shared/spool/spool-wire-contract'
import { SPOOL_TICKET_TTL_MS } from '../../shared/spool/spool-wire-contract'

const MAX_OUTSTANDING_SPOOL_TICKETS = 2_048

type StoredSpoolTicket = {
  binding: SpoolTicketBinding
  expiresAt: number
}

export type SpoolTicketAuthorityOptions = {
  now?: () => number
  createTicket?: () => string
}

export class SpoolTicketAuthority {
  private readonly tickets = new Map<string, StoredSpoolTicket>()
  private readonly now: () => number
  private readonly createTicket: () => string

  constructor(options: SpoolTicketAuthorityOptions = {}) {
    this.now = options.now ?? Date.now
    this.createTicket = options.createTicket ?? (() => randomBytes(32).toString('base64url'))
  }

  issue(binding: SpoolTicketBinding): SpoolTicket {
    assertClientPublicKey(binding.clientPublicKeyB64)
    this.pruneExpired()
    if (this.tickets.size >= MAX_OUTSTANDING_SPOOL_TICKETS) {
      throw new Error('spool_ticket_capacity_exceeded')
    }
    const value = this.createUniqueTicket()
    const expiresAt = this.now() + SPOOL_TICKET_TTL_MS
    this.tickets.set(value, { binding: cloneBinding(binding), expiresAt })
    return { value, expiresAt }
  }

  consume(
    ticket: string,
    binding: SpoolTicketBinding,
    connectionId: string
  ): AuthenticatedSpoolPrincipal | null {
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
      kind: 'spool',
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
    throw new Error('spool_ticket_generation_failed')
  }
}

function cloneBinding(binding: SpoolTicketBinding): SpoolTicketBinding {
  return { ...binding, requester: { ...binding.requester } }
}

function bindingsEqual(left: SpoolTicketBinding, right: SpoolTicketBinding): boolean {
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
    throw new Error('invalid_spool_client_public_key')
  }
}

function fingerprintPublicKey(publicKeyB64: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('base64url')
}
