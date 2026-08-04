import { randomUUID } from 'node:crypto'

import type {
  CoworkingHostAccessDecision,
  CoworkingHostAccessRequest,
  CoworkingHostAccessRequestResult,
  CoworkingHostAccessTier
} from '~shared/coworking/host-access-contract'
import type { PairingOffer } from '~shared/pairing'
import type { AuthenticatedCoworkingPrincipal } from '~shared/rpc-principal'

type PendingHostAccessRequest = {
  request: CoworkingHostAccessRequest
  promise: Promise<CoworkingHostAccessRequestResult>
  resolve: (result: CoworkingHostAccessRequestResult) => void
  signal: AbortSignal
  abort: () => void
}

export type CoworkingHostAccessAuthorityOptions = {
  issue: (args: {
    name: string
    requester: CoworkingHostAccessRequest['requester']
    tier: CoworkingHostAccessTier
    expiresAt: number
  }) => PairingOffer
  recordDenied?: (request: CoworkingHostAccessRequest) => void
  now?: () => number
  createId?: () => string
}

const COWORKING_HOST_ACCESS_TTL_MS = 90 * 24 * 60 * 60 * 1_000

export class CoworkingHostAccessAuthority {
  private readonly requests = new Map<string, PendingHostAccessRequest>()
  private readonly listeners = new Set<(requests: readonly CoworkingHostAccessRequest[]) => void>()
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly options: CoworkingHostAccessAuthorityOptions) {
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID
  }

  request(
    principal: AuthenticatedCoworkingPrincipal,
    signal: AbortSignal
  ): Promise<CoworkingHostAccessRequestResult> {
    const existing = [...this.requests.values()].find(
      (pending) => pending.request.connectionId === principal.connectionId
    )
    if (existing) {
      return existing.promise
    }
    const request: CoworkingHostAccessRequest = {
      requestId: this.createId(),
      connectionId: principal.connectionId,
      requester: { ...principal.tailnet },
      requestedAt: this.now()
    }
    let resolveRequest: (result: CoworkingHostAccessRequestResult) => void = () => {}
    const promise = new Promise<CoworkingHostAccessRequestResult>((resolve) => {
      resolveRequest = resolve
    })
    const abort = (): void => this.settle(request.requestId, { status: 'cancelled' })
    this.requests.set(request.requestId, {
      request,
      promise,
      resolve: resolveRequest,
      signal,
      abort
    })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
    } else {
      this.emit()
    }
    return promise
  }

  decide(decision: CoworkingHostAccessDecision): void {
    const pending = this.requests.get(decision.requestId)
    if (!pending) {
      return
    }
    if (decision.decision === 'deny') {
      try {
        this.options.recordDenied?.(pending.request)
      } catch {
        // Why: a deny remains safe even when its best-effort audit record cannot be appended.
      }
      this.settle(decision.requestId, { status: 'denied' })
      return
    }
    const name = decision.name.trim()
    if (!name) {
      throw new Error('invalid_coworking_host_access_name')
    }
    const offer = this.options.issue({
      name,
      requester: pending.request.requester,
      tier: decision.tier,
      expiresAt: this.now() + COWORKING_HOST_ACCESS_TTL_MS
    })
    this.settle(decision.requestId, { status: 'granted', offer })
  }

  connectionClosed(connectionId: string): void {
    for (const pending of this.requests.values()) {
      if (pending.request.connectionId === connectionId) {
        this.settle(pending.request.requestId, { status: 'cancelled' })
      }
    }
  }

  subscribe(listener: (requests: readonly CoworkingHostAccessRequest[]) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  private settle(requestId: string, result: CoworkingHostAccessRequestResult): void {
    const pending = this.requests.get(requestId)
    if (!pending) {
      return
    }
    this.requests.delete(requestId)
    pending.signal.removeEventListener('abort', pending.abort)
    this.emit()
    pending.resolve(result)
  }

  private snapshot(): readonly CoworkingHostAccessRequest[] {
    return [...this.requests.values()].map(({ request }) => ({
      ...request,
      requester: { ...request.requester }
    }))
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}
