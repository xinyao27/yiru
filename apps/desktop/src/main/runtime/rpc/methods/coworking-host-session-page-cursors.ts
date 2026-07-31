import { randomUUID } from 'node:crypto'

import { CoworkingExecutionError } from '~main/coworking/execution-error'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import {
  encodeCoworkingHostSessionPageBinding,
  encodeCoworkingHostSessionPageReleaseBinding,
  coworkingHostSessionPageConnectionCleanupId,
  type CoworkingHostSessionPageBinding,
  type CoworkingHostSessionPageReleaseBinding
} from './coworking-host-session-page-binding'
import {
  createCoworkingHostSessionPageChain,
  type CoworkingHostBoundSessionPageCursor,
  type CoworkingHostResolvedSessionPageCursor,
  type CoworkingHostSessionPageChain
} from './coworking-host-session-page-chain'
import {
  coworkingHostSessionNextExpiryDelay,
  COWORKING_HOST_SESSION_CURSOR_IDLE_TTL_MS,
  COWORKING_HOST_SESSION_MAX_ACTIVE_CHAINS,
  COWORKING_HOST_SESSION_MAX_INNER_CURSOR_LENGTH,
  COWORKING_HOST_SESSION_MAX_REPLAYABLE_CURSORS
} from './coworking-host-session-page-limits'
import {
  CoworkingHostSessionPageOpenings,
  type CoworkingHostSessionPageOpening
} from './coworking-host-session-page-openings'

export type { CoworkingHostResolvedSessionPageCursor } from './coworking-host-session-page-chain'

/** Keeps scanner cursors owner-only and binds their aliases to one encrypted connection. */
export class CoworkingHostSessionPageCursors {
  private readonly chains = new Map<string, CoworkingHostSessionPageChain>()
  private readonly cursors = new Map<string, CoworkingHostBoundSessionPageCursor>()
  private readonly openings = new CoworkingHostSessionPageOpenings()
  private readonly activeConnections = new Set<string>()
  private expiryTimer: NodeJS.Timeout | null = null

  ensureConnection(runtime: YiruRuntimeService, connectionId: string): void {
    if (this.activeConnections.has(connectionId)) {
      return
    }
    this.activeConnections.add(connectionId)
    runtime.registerSubscriptionCleanup(
      coworkingHostSessionPageConnectionCleanupId(connectionId),
      () => {
        this.activeConnections.delete(connectionId)
        this.releaseConnection(connectionId)
      },
      connectionId
    )
  }

  resolve(
    binding: CoworkingHostSessionPageBinding,
    cursor: string | null
  ): CoworkingHostResolvedSessionPageCursor {
    this.expireIdleChains()
    if (cursor === null) {
      return { chainId: null, innerCursor: null, settled: false }
    }
    const bound = this.cursors.get(cursor)
    const chain = bound ? this.chains.get(bound.chainId) : null
    if (!bound || !chain || chain.bindingKey !== encodeCoworkingHostSessionPageBinding(binding)) {
      throw new Error('Unknown or mismatched paired-runtime session cursor')
    }
    chain.lastAccessedAt = Date.now()
    chain.activeReads++
    this.scheduleExpiry()
    return { chainId: chain.id, innerCursor: bound.innerCursor, settled: false }
  }

  beginOpening(
    binding: CoworkingHostSessionPageBinding,
    cancel: () => void | Promise<void>
  ): CoworkingHostSessionPageOpening {
    if (
      !this.activeConnections.has(binding.physicalConnectionId) ||
      this.chains.size + this.openings.size >= COWORKING_HOST_SESSION_MAX_ACTIVE_CHAINS
    ) {
      throw new CoworkingExecutionError('resource_busy')
    }
    return this.openings.begin(binding, cancel)
  }

  finishOpening(opening: CoworkingHostSessionPageOpening): void {
    this.openings.finish(opening)
  }

  releaseOpening(binding: CoworkingHostSessionPageReleaseBinding): void {
    this.openings.release(binding)
  }

  bind(
    binding: CoworkingHostSessionPageBinding,
    predecessor: CoworkingHostResolvedSessionPageCursor,
    innerCursor: string | null,
    releaseInnerCursor: (cursor: string) => void | Promise<void>
  ): string | null {
    try {
      if (innerCursor === null) {
        const chain = predecessor.chainId ? this.chains.get(predecessor.chainId) : null
        if (chain) {
          chain.latestInnerCursor = null
        }
        this.requestChainRelease(
          encodeCoworkingHostSessionPageBinding(binding),
          predecessor.chainId,
          false
        )
        return null
      }
      if (
        innerCursor.length === 0 ||
        innerCursor.length > COWORKING_HOST_SESSION_MAX_INNER_CURSOR_LENGTH ||
        innerCursor.includes('\0')
      ) {
        throw new Error('Invalid paired-runtime session continuation')
      }
      if (!this.activeConnections.has(binding.physicalConnectionId)) {
        throw new Error('Paired-runtime session connection is closed')
      }
      const bindingKey = encodeCoworkingHostSessionPageBinding(binding)
      const chain = this.resolveChainForNextPage(
        binding,
        bindingKey,
        predecessor.chainId,
        releaseInnerCursor
      )
      if (chain.releaseRequested) {
        throw new Error('Paired-runtime session cursor chain was released')
      }
      chain.latestInnerCursor = innerCursor
      chain.releaseInnerCursor = releaseInnerCursor
      const existingCursor = chain.aliasesByInnerCursor.get(innerCursor)
      if (existingCursor && this.cursors.has(existingCursor)) {
        chain.lastAccessedAt = Date.now()
        return existingCursor
      }
      if (existingCursor) {
        chain.aliasesByInnerCursor.delete(innerCursor)
      }
      let cursor = randomUUID()
      while (this.cursors.has(cursor)) {
        cursor = randomUUID()
      }
      this.cursors.set(cursor, { chainId: chain.id, innerCursor })
      chain.cursors.push(cursor)
      chain.aliasesByInnerCursor.set(innerCursor, cursor)
      chain.lastAccessedAt = Date.now()
      while (chain.cursors.length > COWORKING_HOST_SESSION_MAX_REPLAYABLE_CURSORS) {
        const expired = chain.cursors.shift()
        if (expired) {
          this.deleteCursor(chain, expired)
        }
      }
      return cursor
    } finally {
      this.settle(predecessor)
    }
  }

  release(
    binding: CoworkingHostSessionPageBinding,
    cursor: CoworkingHostResolvedSessionPageCursor,
    releaseInner = true
  ): void {
    this.requestChainRelease(
      encodeCoworkingHostSessionPageBinding(binding),
      cursor.chainId,
      releaseInner
    )
    this.settle(cursor)
  }

  releaseOpaque(binding: CoworkingHostSessionPageReleaseBinding, cursor: string): void {
    const bound = this.cursors.get(cursor)
    const chain = bound ? this.chains.get(bound.chainId) : null
    if (
      !chain ||
      chain.releaseBindingKey !== encodeCoworkingHostSessionPageReleaseBinding(binding)
    ) {
      throw new Error('Unknown or mismatched paired-runtime session release cursor')
    }
    chain.releaseRequested = true
    chain.releaseInnerOnDelete = true
    if (chain.activeReads === 0) {
      this.deleteChain(chain, true)
    }
  }

  private resolveChainForNextPage(
    binding: CoworkingHostSessionPageBinding,
    bindingKey: string,
    chainId: string | null,
    releaseInnerCursor: (cursor: string) => void | Promise<void>
  ): CoworkingHostSessionPageChain {
    if (chainId !== null) {
      const chain = this.chains.get(chainId)
      if (!chain || chain.bindingKey !== bindingKey) {
        throw new Error('Unknown or mismatched paired-runtime session cursor chain')
      }
      this.expireIdleChains(chain.id)
      return chain
    }
    this.expireIdleChains()
    if (this.chains.size >= COWORKING_HOST_SESSION_MAX_ACTIVE_CHAINS) {
      throw new CoworkingExecutionError('resource_busy')
    }
    const chain = createCoworkingHostSessionPageChain(binding, bindingKey, releaseInnerCursor)
    this.chains.set(chain.id, chain)
    this.scheduleExpiry()
    return chain
  }

  private expireIdleChains(retainedChainId: string | null = null): void {
    const cutoff = Date.now() - COWORKING_HOST_SESSION_CURSOR_IDLE_TTL_MS
    for (const [chainId, chain] of this.chains) {
      if (chainId !== retainedChainId && chain.activeReads === 0 && chain.lastAccessedAt < cutoff) {
        this.deleteChain(chain, true)
      }
    }
    this.scheduleExpiry()
  }

  private deleteCursor(chain: CoworkingHostSessionPageChain, cursor: string): void {
    const bound = this.cursors.get(cursor)
    this.cursors.delete(cursor)
    if (bound && chain.aliasesByInnerCursor.get(bound.innerCursor) === cursor) {
      chain.aliasesByInnerCursor.delete(bound.innerCursor)
    }
  }

  private deleteChain(chain: CoworkingHostSessionPageChain, releaseInner: boolean): void {
    this.chains.delete(chain.id)
    for (const cursor of chain.cursors) {
      this.cursors.delete(cursor)
    }
    if (releaseInner && chain.latestInnerCursor !== null) {
      void Promise.resolve(chain.releaseInnerCursor(chain.latestInnerCursor)).catch(() => {})
    }
    this.scheduleExpiry()
  }

  private requestChainRelease(
    bindingKey: string,
    chainId: string | null,
    releaseInner: boolean
  ): void {
    if (chainId === null) {
      return
    }
    const chain = this.chains.get(chainId)
    if (!chain) {
      // Why: terminal-page retries may race after one response already released shared state.
      return
    }
    if (chain.bindingKey !== bindingKey) {
      throw new Error('Mismatched paired-runtime session cursor chain completion')
    }
    chain.releaseRequested = true
    chain.releaseInnerOnDelete ||= releaseInner
    if (chain.activeReads === 0) {
      // Why: completed chains must release capacity instead of blocking the next catalog refresh.
      this.deleteChain(chain, chain.releaseInnerOnDelete)
    }
  }

  private releaseConnection(connectionId: string): void {
    this.openings.releaseConnection(connectionId)
    for (const chain of this.chains.values()) {
      if (chain.physicalConnectionId === connectionId) {
        this.requestChainRelease(chain.bindingKey, chain.id, true)
      }
    }
  }

  private settle(cursor: CoworkingHostResolvedSessionPageCursor): void {
    if (cursor.settled) {
      return
    }
    cursor.settled = true
    if (cursor.chainId === null) {
      return
    }
    const chain = this.chains.get(cursor.chainId)
    if (!chain) {
      return
    }
    chain.activeReads--
    chain.lastAccessedAt = Date.now()
    if (chain.activeReads === 0 && chain.releaseRequested) {
      this.deleteChain(chain, chain.releaseInnerOnDelete)
    } else {
      this.scheduleExpiry()
    }
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
    this.expiryTimer = setTimeout(
      () => {
        this.expiryTimer = null
        this.expireIdleChains()
      },
      coworkingHostSessionNextExpiryDelay(this.chains.values(), now)
    )
    this.expiryTimer.unref()
  }
}
