import { randomUUID } from 'node:crypto'

import { waitForSessionInventoryAbort } from '../ai-vault/session-inventory-abort'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolSessionPageProjector,
  SpoolSessionPageState
} from './spool-session-page-projector'
import type { SpoolSessionCatalogDescription } from './spool-session-resolution'
import {
  requireExactWorktreeIdentity,
  requireInventoryScope,
  sessionChainBindingKey,
  toSessionWorktree
} from './spool-session-worktree-binding'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

const MAX_ACTIVE_SESSION_CHAINS = 256
const MAX_REPLAYABLE_SESSION_PAGES = 4
const SESSION_CHAIN_IDLE_TTL_MS = 15 * 60_000
const ACTIVE_EXPIRY_RECHECK_MS = 30_000

export type SpoolSessionCatalogPageResult = {
  sessions: readonly SpoolSessionCatalogDescription[]
  nextCursor: string | null
}

type SessionPageChain = SpoolSessionPageState & {
  id: string
  bindingKey: string
  instanceId: string
  sourceGeneration: number
  instanceGeneration: number
  cursors: string[]
  activeReads: number
  releaseRequested: boolean
  lastAccessedAt: number
}

type SessionPageCursor = {
  chainId: string
  page: Promise<SpoolSessionCatalogPageResult> | null
}

export class SpoolSessionPageChains {
  private readonly chains = new Map<string, SessionPageChain>()
  private readonly cursors = new Map<string, SessionPageCursor>()
  private readonly instanceGenerations = new Map<string, number>()
  private openingChains = 0
  private sourceGeneration = 0
  private expiryTimer: NodeJS.Timeout | null = null

  constructor(private readonly projector: SpoolSessionPageProjector) {}

  async listPage(
    instance: SpoolPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string,
    signal: AbortSignal
  ): Promise<SpoolSessionCatalogPageResult> {
    const worktree = toSessionWorktree(instance)
    requireExactWorktreeIdentity(worktree)
    requireInventoryScope(inventoryScope)
    this.expireIdleChains()
    if (cursor === null) {
      return await this.readFirstPage(instance, inventoryScope, signal)
    }
    const cursorPage = this.cursors.get(cursor)
    const chain = cursorPage ? this.chains.get(cursorPage.chainId) : null
    if (
      !cursorPage ||
      !chain ||
      chain.bindingKey !== sessionChainBindingKey(worktree, inventoryScope)
    ) {
      throw new Error('Unknown or mismatched Spool session catalog cursor')
    }
    chain.activeReads++
    chain.lastAccessedAt = Date.now()
    try {
      cursorPage.page ??= this.projectPage(chain, signal)
      return await waitForSessionInventoryAbort(cursorPage.page, signal)
    } catch (error) {
      this.deleteChain(chain, true)
      throw error
    } finally {
      this.finishRead(chain)
    }
  }

  release(
    instance: SpoolPublicWorktreeInstance,
    cursor: string | null,
    inventoryScope: string
  ): void {
    if (cursor === null) {
      return
    }
    const page = this.cursors.get(cursor)
    const chain = page ? this.chains.get(page.chainId) : null
    if (chain?.bindingKey === sessionChainBindingKey(toSessionWorktree(instance), inventoryScope)) {
      this.requestChainRelease(chain)
    }
  }

  invalidateInstance(instanceId: string): void {
    this.instanceGenerations.set(instanceId, this.instanceGeneration(instanceId) + 1)
    for (const chain of this.chains.values()) {
      if (chain.instanceId === instanceId) {
        this.requestChainRelease(chain)
      }
    }
  }

  clear(): void {
    this.sourceGeneration++
    for (const chain of this.chains.values()) {
      this.requestChainRelease(chain)
    }
  }

  private async readFirstPage(
    instance: SpoolPublicWorktreeInstance,
    inventoryScope: string,
    signal: AbortSignal
  ): Promise<SpoolSessionCatalogPageResult> {
    if (this.chains.size + this.openingChains >= MAX_ACTIVE_SESSION_CHAINS) {
      throw new SpoolExecutionError('resource_busy')
    }
    this.openingChains++
    try {
      signal.throwIfAborted()
      const worktree = toSessionWorktree(instance)
      const sourceGeneration = this.sourceGeneration
      const instanceGeneration = this.instanceGeneration(worktree.instanceId)
      const requireCurrent = (): void => {
        if (
          sourceGeneration !== this.sourceGeneration ||
          instanceGeneration !== this.instanceGeneration(worktree.instanceId)
        ) {
          throw new Error('Spool session catalog changed during inventory creation')
        }
      }
      const state = await this.projector.open(worktree, inventoryScope, requireCurrent, signal)
      signal.throwIfAborted()
      const chain: SessionPageChain = {
        ...state,
        id: randomUUID(),
        bindingKey: sessionChainBindingKey(state.worktree, inventoryScope),
        instanceId: state.worktree.instanceId,
        sourceGeneration,
        instanceGeneration,
        cursors: [],
        activeReads: 1,
        releaseRequested: false,
        lastAccessedAt: Date.now()
      }
      this.chains.set(chain.id, chain)
      this.scheduleExpiry()
      try {
        return await this.projectPage(chain, signal)
      } catch (error) {
        this.deleteChain(chain, true)
        throw error
      } finally {
        this.finishRead(chain)
      }
    } finally {
      this.openingChains--
    }
  }

  private async projectPage(
    chain: SessionPageChain,
    signal: AbortSignal
  ): Promise<SpoolSessionCatalogPageResult> {
    const page = await this.projector.project(chain, () => this.requireCurrent(chain), signal)
    signal.throwIfAborted()
    this.requireCurrent(chain)
    const nextCursor = page.complete ? null : this.createCursor(chain)
    if (page.complete) {
      this.deleteChain(chain, false)
    }
    return { sessions: page.sessions, nextCursor }
  }

  private createCursor(chain: SessionPageChain): string {
    const cursor = randomUUID()
    this.cursors.set(cursor, { chainId: chain.id, page: null })
    chain.cursors.push(cursor)
    while (chain.cursors.length > MAX_REPLAYABLE_SESSION_PAGES) {
      const expired = chain.cursors.shift()
      if (expired) {
        this.cursors.delete(expired)
      }
    }
    return cursor
  }

  private requireCurrent(chain: SessionPageChain): void {
    if (
      this.chains.get(chain.id) !== chain ||
      chain.releaseRequested ||
      chain.sourceGeneration !== this.sourceGeneration ||
      chain.instanceGeneration !== this.instanceGeneration(chain.instanceId)
    ) {
      throw new Error('Spool session catalog chain was invalidated during a page read')
    }
  }

  private instanceGeneration(instanceId: string): number {
    return this.instanceGenerations.get(instanceId) ?? 0
  }

  private finishRead(chain: SessionPageChain): void {
    chain.activeReads--
    chain.lastAccessedAt = Date.now()
    if (chain.activeReads === 0 && chain.releaseRequested) {
      this.deleteChain(chain, true)
    } else {
      this.scheduleExpiry()
    }
  }

  private deleteChain(chain: SessionPageChain, abortHistoricalPages: boolean): void {
    if (!this.chains.delete(chain.id)) {
      return
    }
    for (const cursor of chain.cursors) {
      this.cursors.delete(cursor)
    }
    if (abortHistoricalPages) {
      // Why: generator cleanup releases the host inventory cursor behind an abandoned wire chain.
      void chain.historicalPages.return(undefined).catch(() => {})
    }
    this.scheduleExpiry()
  }

  private expireIdleChains(): void {
    const cutoff = Date.now() - SESSION_CHAIN_IDLE_TTL_MS
    for (const chain of this.chains.values()) {
      if (chain.activeReads === 0 && chain.lastAccessedAt < cutoff) {
        this.requestChainRelease(chain)
      }
    }
    this.scheduleExpiry()
  }

  private requestChainRelease(chain: SessionPageChain): void {
    chain.releaseRequested = true
    if (chain.activeReads === 0) {
      this.deleteChain(chain, true)
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
    let nextExpiryAt = Number.POSITIVE_INFINITY
    for (const chain of this.chains.values()) {
      nextExpiryAt = Math.min(
        nextExpiryAt,
        chain.activeReads > 0
          ? now + ACTIVE_EXPIRY_RECHECK_MS
          : chain.lastAccessedAt + SESSION_CHAIN_IDLE_TTL_MS
      )
    }
    this.expiryTimer = setTimeout(
      () => {
        this.expiryTimer = null
        this.expireIdleChains()
      },
      Math.max(1, nextExpiryAt - now)
    )
    this.expiryTimer.unref()
  }
}
