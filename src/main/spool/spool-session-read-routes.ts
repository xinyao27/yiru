import { randomUUID } from 'node:crypto'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolExecutionHostSessionReadRequest,
  SpoolHistoricalSessionPurpose,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'

const MAX_ACTIVE_READ_ROUTES = 256
const MAX_REPLAYABLE_ROUTE_CURSORS = 4
const READ_ROUTE_IDLE_TTL_MS = 15 * 60_000
const ACTIVE_EXPIRY_RECHECK_MS = 30_000

export type SpoolSessionReadRouteBinding = Readonly<{
  bindingKey: string
}>

export type SpoolSessionReadRouteLease = {
  chain: ReadRouteChain
  request: SpoolExecutionHostSessionReadRequest
  settled: boolean
}

type ReadRouteChain = {
  id: string
  bindingKey: string
  request: SpoolExecutionHostSessionReadRequest
  cursors: string[]
  latestCursor: string | null
  activeReads: number
  releaseRequested: boolean
  lastAccessedAt: number
}

/** Freezes the actual host request behind each opaque inventory cursor chain. */
export class SpoolSessionReadRoutes {
  private readonly chains = new Map<string, ReadRouteChain>()
  private readonly chainByCursor = new Map<string, ReadRouteChain>()
  private expiryTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly releaseAbandoned: (
      request: SpoolExecutionHostSessionReadRequest,
      cursor: string
    ) => void | Promise<void>
  ) {}

  begin(
    binding: SpoolSessionReadRouteBinding,
    cursor: string | null,
    firstRequest?: SpoolExecutionHostSessionReadRequest
  ): SpoolSessionReadRouteLease {
    this.expireIdleRoutes()
    if (cursor === null) {
      if (!firstRequest) {
        throw new Error('Missing first Spool session read route')
      }
      if (this.chains.size >= MAX_ACTIVE_READ_ROUTES) {
        throw new SpoolExecutionError('resource_busy')
      }
      const chain: ReadRouteChain = {
        id: randomUUID(),
        bindingKey: binding.bindingKey,
        request: firstRequest,
        cursors: [],
        latestCursor: null,
        activeReads: 1,
        releaseRequested: false,
        lastAccessedAt: Date.now()
      }
      this.chains.set(chain.id, chain)
      this.scheduleExpiry()
      return { chain, request: chain.request, settled: false }
    }
    const chain = this.chainByCursor.get(cursor)
    if (!chain || chain.bindingKey !== binding.bindingKey) {
      throw new Error('Unknown or mismatched Spool session read route')
    }
    chain.activeReads++
    chain.lastAccessedAt = Date.now()
    this.scheduleExpiry()
    return { chain, request: chain.request, settled: false }
  }

  commit(lease: SpoolSessionReadRouteLease, nextCursor: string | null): void {
    try {
      if (lease.chain.releaseRequested) {
        throw new Error('Spool session read route was released during a page read')
      }
      if (nextCursor === null) {
        lease.chain.latestCursor = null
        lease.chain.releaseRequested = true
        return
      }
      requireValidCursor(nextCursor)
      const existing = this.chainByCursor.get(nextCursor)
      if (existing && existing !== lease.chain) {
        throw new Error('Spool session read cursor collision')
      }
      if (!existing) {
        this.chainByCursor.set(nextCursor, lease.chain)
        lease.chain.cursors.push(nextCursor)
      }
      lease.chain.latestCursor = nextCursor
      while (lease.chain.cursors.length > MAX_REPLAYABLE_ROUTE_CURSORS) {
        const expired = lease.chain.cursors.shift()
        if (expired) {
          this.chainByCursor.delete(expired)
        }
      }
    } finally {
      this.settle(lease)
    }
  }

  fail(lease: SpoolSessionReadRouteLease): void {
    lease.chain.releaseRequested = true
    if (lease.settled) {
      if (lease.chain.activeReads === 0) {
        this.deleteRoute(lease.chain, false)
      }
    } else {
      this.settle(lease)
    }
  }

  release(
    binding: SpoolSessionReadRouteBinding,
    cursor: string | null
  ): SpoolExecutionHostSessionReadRequest | null {
    if (cursor === null) {
      return null
    }
    const chain = this.chainByCursor.get(cursor)
    if (!chain || chain.bindingKey !== binding.bindingKey) {
      return null
    }
    chain.releaseRequested = true
    if (chain.activeReads === 0) {
      this.deleteRoute(chain, false)
    }
    return chain.request
  }

  private settle(lease: SpoolSessionReadRouteLease): void {
    if (lease.settled) {
      return
    }
    lease.settled = true
    lease.chain.activeReads--
    lease.chain.lastAccessedAt = Date.now()
    if (lease.chain.activeReads === 0 && lease.chain.releaseRequested) {
      this.deleteRoute(lease.chain, false)
    } else {
      this.scheduleExpiry()
    }
  }

  private expireIdleRoutes(): void {
    const cutoff = Date.now() - READ_ROUTE_IDLE_TTL_MS
    for (const chain of this.chains.values()) {
      if (chain.activeReads === 0 && chain.lastAccessedAt < cutoff) {
        this.deleteRoute(chain, true)
      }
    }
    this.scheduleExpiry()
  }

  private deleteRoute(chain: ReadRouteChain, releaseInner: boolean): void {
    if (!this.chains.delete(chain.id)) {
      return
    }
    for (const cursor of chain.cursors) {
      this.chainByCursor.delete(cursor)
    }
    if (releaseInner && chain.latestCursor !== null) {
      void Promise.resolve(this.releaseAbandoned(chain.request, chain.latestCursor)).catch(() => {})
    }
    this.scheduleExpiry()
  }

  private scheduleExpiry(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer)
      this.expiryTimer = null
    }
    if (this.chains.size === 0) {
      return
    }
    const now = Date.now()
    let nextExpiryAt = Number.POSITIVE_INFINITY
    for (const chain of this.chains.values()) {
      nextExpiryAt = Math.min(
        nextExpiryAt,
        chain.activeReads > 0
          ? now + ACTIVE_EXPIRY_RECHECK_MS
          : chain.lastAccessedAt + READ_ROUTE_IDLE_TTL_MS
      )
    }
    this.expiryTimer = setTimeout(
      () => {
        this.expiryTimer = null
        this.expireIdleRoutes()
      },
      Math.max(1, nextExpiryAt - now)
    )
    this.expiryTimer.unref()
  }
}

export function spoolSessionReadRouteBinding(
  worktree: SpoolSessionWorktreeIdentity,
  purpose: SpoolHistoricalSessionPurpose,
  inventoryScope: string
): SpoolSessionReadRouteBinding {
  return {
    bindingKey: JSON.stringify([
      worktree.worktreeId,
      worktree.instanceId,
      worktree.spoolIncarnationId,
      worktree.target.kind,
      worktree.target.executionHostId,
      worktree.actualHostScope,
      worktree.target.worktreePath,
      purpose,
      inventoryScope
    ])
  }
}

function requireValidCursor(cursor: string): void {
  if (cursor.length === 0 || cursor.length > 2_048 || cursor.includes('\0')) {
    throw new Error('Invalid Spool session read cursor')
  }
}
