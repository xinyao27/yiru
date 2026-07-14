import { randomUUID } from 'node:crypto'
import type {
  SpoolControlDecision,
  SpoolControlGrant,
  SpoolControlRequest,
  SpoolOwnerDecision
} from '../../shared/spool/spool-access-contract'
import type { AuthenticatedSpoolPrincipal } from '../../shared/spool/spool-wire-contract'

const MAX_PENDING_REQUESTS_PER_CONNECTION = 4
const DENIED_REQUEST_COOLDOWN_MS = 3_000

export type SpoolAccessAuthorityOptions = {
  ownerRuntimeId: string
  isPublic: (instanceId: string, shareEpoch: string) => boolean
  now?: () => number
  createId?: () => string
}

export class SpoolAccessError extends Error {
  constructor(readonly code: 'resource_busy' | 'resource_not_found' | 'unauthorized') {
    super(code)
    this.name = 'SpoolAccessError'
  }
}

export class SpoolAccessAuthority {
  private readonly connections = new Map<string, AuthenticatedSpoolPrincipal>()
  private readonly requests = new Map<string, SpoolControlRequest>()
  private readonly grants = new Map<string, SpoolControlGrant>()
  private readonly deniedUntil = new Map<string, number>()
  private readonly requestListeners = new Set<(requests: readonly SpoolControlRequest[]) => void>()
  private readonly grantListeners = new Set<(grants: readonly SpoolControlGrant[]) => void>()
  private readonly ownerRuntimeId: string
  private readonly isPublic: (instanceId: string, shareEpoch: string) => boolean
  private readonly now: () => number
  private readonly createId: () => string

  constructor(options: SpoolAccessAuthorityOptions) {
    this.ownerRuntimeId = options.ownerRuntimeId
    this.isPublic = options.isPublic
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID
  }

  connectionOpened(principal: AuthenticatedSpoolPrincipal): void {
    this.connections.set(principal.connectionId, principal)
  }

  getConnectionPrincipal(connectionId: string): AuthenticatedSpoolPrincipal | null {
    const principal = this.connections.get(connectionId)
    return principal ? { ...principal, tailnet: { ...principal.tailnet } } : null
  }

  getControlGrant(
    connectionId: string,
    instanceId: string,
    shareEpoch: string
  ): SpoolControlGrant | null {
    const grant = [...this.grants.values()].find(
      (candidate) =>
        candidate.connectionId === connectionId &&
        candidate.instanceId === instanceId &&
        candidate.shareEpoch === shareEpoch
    )
    return grant ? { ...grant } : null
  }

  request(target: {
    connectionId: string
    instanceId: string
    shareEpoch: string
  }): SpoolControlRequest {
    const principal = this.connections.get(target.connectionId)
    if (!principal || !this.isPublic(target.instanceId, target.shareEpoch)) {
      throw new SpoolAccessError('resource_not_found')
    }
    if (this.getControlGrant(target.connectionId, target.instanceId, target.shareEpoch)) {
      // Why: one connection/worktree has one authority generation; duplicate
      // grants would let revoking one visible row leave another grant active.
      throw new SpoolAccessError('resource_busy')
    }
    const existing = this.findRequest(target.connectionId, target.instanceId, target.shareEpoch)
    if (existing) {
      return existing
    }
    const key = requestTargetKey(target.connectionId, target.instanceId)
    if ((this.deniedUntil.get(key) ?? 0) > this.now()) {
      throw new SpoolAccessError('resource_busy')
    }
    const pendingForConnection = [...this.requests.values()].filter(
      (request) => request.connectionId === target.connectionId
    ).length
    if (pendingForConnection >= MAX_PENDING_REQUESTS_PER_CONNECTION) {
      throw new SpoolAccessError('resource_busy')
    }
    const request: SpoolControlRequest = {
      requestId: this.createId(),
      connectionId: target.connectionId,
      requester: { ...principal.tailnet },
      instanceId: target.instanceId,
      shareEpoch: target.shareEpoch,
      requestedAt: this.now()
    }
    this.requests.set(request.requestId, request)
    this.emitRequests()
    return request
  }

  decide(ownerDecision: SpoolOwnerDecision): SpoolControlDecision {
    const request = this.requests.get(ownerDecision.requestId)
    if (!request) {
      return { status: 'cancelled', requestId: ownerDecision.requestId }
    }
    this.requests.delete(request.requestId)
    this.emitRequests()
    if (ownerDecision.decision === 'deny') {
      this.deniedUntil.set(
        requestTargetKey(request.connectionId, request.instanceId),
        this.now() + DENIED_REQUEST_COOLDOWN_MS
      )
      return { status: 'denied', requestId: request.requestId }
    }
    const principal = this.connections.get(request.connectionId)
    if (!principal || !this.isPublic(request.instanceId, request.shareEpoch)) {
      return { status: 'cancelled', requestId: request.requestId }
    }
    const existingGrant = this.getControlGrant(
      request.connectionId,
      request.instanceId,
      request.shareEpoch
    )
    if (existingGrant) {
      return { status: 'granted', requestId: request.requestId, grant: existingGrant }
    }
    const grant: SpoolControlGrant = {
      grantId: this.createId(),
      ownerRuntimeId: this.ownerRuntimeId,
      requesterNodeId: principal.tailnet.nodeId,
      connectionId: request.connectionId,
      instanceId: request.instanceId,
      shareEpoch: request.shareEpoch,
      approvedAt: this.now()
    }
    this.grants.set(grant.grantId, grant)
    this.emitGrants()
    return { status: 'granted', requestId: request.requestId, grant }
  }

  requireControl(connectionId: string, instanceId: string, shareEpoch: string): SpoolControlGrant {
    const grant = this.getControlGrant(connectionId, instanceId, shareEpoch)
    if (!grant || !this.connections.has(connectionId) || !this.isPublic(instanceId, shareEpoch)) {
      throw new SpoolAccessError('unauthorized')
    }
    return grant
  }

  revoke(grantId: string): void {
    if (this.grants.delete(grantId)) {
      this.emitGrants()
    }
  }

  connectionClosed(connectionId: string): void {
    this.connections.delete(connectionId)
    const requestsChanged = deleteMatching(
      this.requests,
      (value) => value.connectionId === connectionId
    )
    const grantsChanged = deleteMatching(
      this.grants,
      (value) => value.connectionId === connectionId
    )
    for (const key of this.deniedUntil.keys()) {
      if (key.startsWith(`${connectionId}\0`)) {
        this.deniedUntil.delete(key)
      }
    }
    if (requestsChanged) {
      this.emitRequests()
    }
    if (grantsChanged) {
      this.emitGrants()
    }
  }

  invalidateWorktree(instanceId: string): void {
    const requestsChanged = deleteMatching(
      this.requests,
      (value) => value.instanceId === instanceId
    )
    const grantsChanged = deleteMatching(this.grants, (value) => value.instanceId === instanceId)
    if (requestsChanged) {
      this.emitRequests()
    }
    if (grantsChanged) {
      this.emitGrants()
    }
  }

  subscribeOwnerRequests(listener: (requests: readonly SpoolControlRequest[]) => void): () => void {
    this.requestListeners.add(listener)
    listener(this.requestSnapshot())
    return () => this.requestListeners.delete(listener)
  }

  subscribeGrants(listener: (grants: readonly SpoolControlGrant[]) => void): () => void {
    this.grantListeners.add(listener)
    listener(this.grantSnapshot())
    return () => this.grantListeners.delete(listener)
  }

  private findRequest(
    connectionId: string,
    instanceId: string,
    shareEpoch: string
  ): SpoolControlRequest | undefined {
    return [...this.requests.values()].find(
      (request) =>
        request.connectionId === connectionId &&
        request.instanceId === instanceId &&
        request.shareEpoch === shareEpoch
    )
  }

  private requestSnapshot(): readonly SpoolControlRequest[] {
    return [...this.requests.values()].map((request) => ({
      ...request,
      requester: { ...request.requester }
    }))
  }

  private grantSnapshot(): readonly SpoolControlGrant[] {
    return [...this.grants.values()].map((grant) => ({ ...grant }))
  }

  private emitRequests(): void {
    const snapshot = this.requestSnapshot()
    for (const listener of this.requestListeners) {
      listener(snapshot)
    }
  }

  private emitGrants(): void {
    const snapshot = this.grantSnapshot()
    for (const listener of this.grantListeners) {
      listener(snapshot)
    }
  }
}

function requestTargetKey(connectionId: string, instanceId: string): string {
  return `${connectionId}\0${instanceId}`
}

function deleteMatching<T>(map: Map<string, T>, predicate: (value: T) => boolean): boolean {
  let changed = false
  for (const [key, value] of map) {
    if (predicate(value)) {
      map.delete(key)
      changed = true
    }
  }
  return changed
}
