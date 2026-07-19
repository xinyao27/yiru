import { randomUUID } from 'node:crypto'

import {
  createSessionInventoryAbortController,
  waitForSessionInventoryAbort
} from './session-inventory-abort'
import {
  ACTIVE_SESSION_INVENTORY_EXPIRY_RECHECK_MS,
  DEFAULT_MAX_ACTIVE_SESSION_INVENTORIES,
  DEFAULT_SESSION_INVENTORY_IDLE_TTL_MS,
  DEFAULT_SESSION_INVENTORY_PAGE_SIZE,
  MAX_REPLAYABLE_SESSION_INVENTORY_PAGES,
  type AiVaultSessionInventoryCursorStoreOptions
} from './session-inventory-cursor-policy'
import { SessionInventoryOpeningRegistry } from './session-inventory-opening-registry'
import type {
  AiVaultSessionInventoryPage,
  AiVaultSessionInventorySlice,
  AiVaultSessionInventorySnapshot
} from './session-inventory-page-types'

type InventoryChain<TSnapshot extends AiVaultSessionInventorySnapshot> = {
  id: string
  bindingKey: string
  snapshot: TSnapshot
  lastAccessedAt: number
  activeReads: number
  releaseRequested: boolean
  abortController: AbortController
  releaseSnapshot?: (snapshot: TSnapshot) => void
  cursors: string[]
}

type CursorPage = {
  chainId: string
  offset: number
  page: Promise<AiVaultSessionInventoryPage> | null
}

/** Owns opaque, replayable cursors while adapters own host-specific discovery and parsing. */
export class AiVaultSessionInventoryCursorStore<TSnapshot extends AiVaultSessionInventorySnapshot> {
  private readonly chains = new Map<string, InventoryChain<TSnapshot>>()
  private readonly pages = new Map<string, CursorPage>()
  private readonly openings = new SessionInventoryOpeningRegistry()
  private readonly pageSize: number
  private readonly maxActiveInventories: number
  private readonly idleTtlMs: number
  private openingInventories = 0
  private expiryTimer: NodeJS.Timeout | null = null

  constructor(options: AiVaultSessionInventoryCursorStoreOptions = {}) {
    this.pageSize = options.pageSize ?? DEFAULT_SESSION_INVENTORY_PAGE_SIZE
    this.maxActiveInventories =
      options.maxActiveInventories ?? DEFAULT_MAX_ACTIVE_SESSION_INVENTORIES
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_SESSION_INVENTORY_IDLE_TTL_MS
  }

  async readPage(options: {
    bindingKey: string
    cursor: string | null
    signal?: AbortSignal
    openSnapshot: (signal: AbortSignal) => Promise<TSnapshot>
    readSnapshotPage: (
      snapshot: TSnapshot,
      offset: number,
      pageSize: number,
      signal: AbortSignal
    ) => Promise<AiVaultSessionInventorySlice>
    validateSnapshot?: (snapshot: TSnapshot) => void
    releaseSnapshot?: (snapshot: TSnapshot) => void
  }): Promise<AiVaultSessionInventoryPage> {
    this.expireIdleChains()
    if (options.cursor === null) {
      return await this.readFirstPage(options)
    }
    const cursorPage = this.pages.get(options.cursor)
    const chain = cursorPage ? this.chains.get(cursorPage.chainId) : null
    if (!cursorPage || !chain || chain.bindingKey !== options.bindingKey) {
      throw new Error('Unknown or mismatched AI Vault session inventory cursor')
    }
    chain.lastAccessedAt = Date.now()
    chain.activeReads++
    const read = createSessionInventoryAbortController([
      chain.abortController.signal,
      options.signal
    ])
    try {
      read.controller.signal.throwIfAborted()
      options.validateSnapshot?.(chain.snapshot)
      cursorPage.page ??= this.projectPage(
        chain,
        cursorPage.offset,
        options.readSnapshotPage,
        read.controller.signal
      )
      return await waitForSessionInventoryAbort(cursorPage.page, read.controller.signal)
    } catch (error) {
      this.deleteChain(chain.id)
      throw error
    } finally {
      read.dispose()
      chain.activeReads--
      chain.lastAccessedAt = Date.now()
      if (chain.activeReads === 0 && chain.releaseRequested) {
        this.deleteChain(chain.id)
      } else {
        this.scheduleExpiry()
      }
    }
  }

  release(bindingKey: string, cursor: string | null): void {
    if (cursor === null) {
      this.openings.abort(bindingKey)
      return
    }
    const page = this.pages.get(cursor)
    const chain = page ? this.chains.get(page.chainId) : null
    if (chain?.bindingKey === bindingKey) {
      if (chain.activeReads > 0) {
        chain.releaseRequested = true
      } else {
        this.deleteChain(chain.id)
      }
    }
  }

  private async readFirstPage(options: {
    bindingKey: string
    signal?: AbortSignal
    openSnapshot: (signal: AbortSignal) => Promise<TSnapshot>
    readSnapshotPage: (
      snapshot: TSnapshot,
      offset: number,
      pageSize: number,
      signal: AbortSignal
    ) => Promise<AiVaultSessionInventorySlice>
    validateSnapshot?: (snapshot: TSnapshot) => void
    releaseSnapshot?: (snapshot: TSnapshot) => void
  }): Promise<AiVaultSessionInventoryPage> {
    if (this.chains.size + this.openingInventories >= this.maxActiveInventories) {
      throw new Error('AI Vault session inventory capacity exceeded')
    }
    this.openingInventories++
    const opening = createSessionInventoryAbortController([options.signal])
    this.openings.remember(options.bindingKey, opening.controller)
    let unownedSnapshot: TSnapshot | null = null
    try {
      // openSnapshot receives the same signal and owns prompt cancellation;
      // awaiting it directly lets this layer take cleanup ownership before checking abort.
      const snapshot = await options.openSnapshot(opening.controller.signal)
      unownedSnapshot = snapshot
      opening.controller.signal.throwIfAborted()
      options.validateSnapshot?.(snapshot)
      const chain: InventoryChain<TSnapshot> = {
        id: randomUUID(),
        bindingKey: options.bindingKey,
        snapshot,
        lastAccessedAt: Date.now(),
        activeReads: 1,
        releaseRequested: false,
        abortController: opening.controller,
        releaseSnapshot: options.releaseSnapshot,
        cursors: []
      }
      this.chains.set(chain.id, chain)
      unownedSnapshot = null
      this.scheduleExpiry()
      try {
        return await this.projectPage(chain, 0, options.readSnapshotPage, opening.controller.signal)
      } catch (error) {
        this.deleteChain(chain.id)
        throw error
      } finally {
        chain.activeReads--
        chain.lastAccessedAt = Date.now()
        if (chain.activeReads === 0 && chain.releaseRequested) {
          this.deleteChain(chain.id)
        } else {
          this.scheduleExpiry()
        }
      }
    } finally {
      if (unownedSnapshot) {
        // Why: cancellation can win after cache acquisition but before a cursor chain owns the lease.
        options.releaseSnapshot?.(unownedSnapshot)
      }
      this.openings.forget(options.bindingKey, opening.controller)
      opening.dispose()
      this.openingInventories--
    }
  }

  private async projectPage(
    chain: InventoryChain<TSnapshot>,
    offset: number,
    readSnapshotPage: (
      snapshot: TSnapshot,
      offset: number,
      pageSize: number,
      signal: AbortSignal
    ) => Promise<AiVaultSessionInventorySlice>,
    signal: AbortSignal
  ): Promise<AiVaultSessionInventoryPage> {
    signal.throwIfAborted()
    const slice = await waitForSessionInventoryAbort(
      readSnapshotPage(chain.snapshot, offset, this.pageSize, signal),
      signal
    )
    signal.throwIfAborted()
    if (chain.releaseRequested) {
      throw new Error('AI Vault session inventory was released during a page read')
    }
    if (
      slice.sessions.length > this.pageSize ||
      slice.nextOffset < offset ||
      (!slice.complete && slice.nextOffset <= offset)
    ) {
      throw new Error('Invalid AI Vault session inventory page')
    }
    const nextCursor = slice.complete ? null : this.createCursor(chain, slice.nextOffset)
    chain.lastAccessedAt = Date.now()
    const page = { sessions: slice.sessions, nextCursor, scannedAt: chain.snapshot.scannedAt }
    if (slice.complete) {
      // Why: a completed snapshot may hold thousands of paths; release it immediately.
      // A lost final response restarts the read-only inventory instead of retaining that memory.
      this.deleteChain(chain.id, false)
    }
    return page
  }

  private createCursor(chain: InventoryChain<TSnapshot>, offset: number): string {
    const cursor = randomUUID()
    this.pages.set(cursor, { chainId: chain.id, offset, page: null })
    chain.cursors.push(cursor)
    while (chain.cursors.length > MAX_REPLAYABLE_SESSION_INVENTORY_PAGES) {
      const expired = chain.cursors.shift()
      if (expired) {
        this.pages.delete(expired)
      }
    }
    return cursor
  }

  private expireIdleChains(): void {
    const cutoff = Date.now() - this.idleTtlMs
    for (const chain of this.chains.values()) {
      if (chain.activeReads === 0 && chain.lastAccessedAt < cutoff) {
        this.deleteChain(chain.id)
      }
    }
    this.scheduleExpiry()
  }

  private deleteChain(chainId: string, abort = true): void {
    const chain = this.chains.get(chainId)
    if (!chain) {
      return
    }
    this.chains.delete(chainId)
    if (abort) {
      chain.abortController.abort()
    }
    chain.releaseSnapshot?.(chain.snapshot)
    for (const cursor of chain.cursors) {
      this.pages.delete(cursor)
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
          ? now + ACTIVE_SESSION_INVENTORY_EXPIRY_RECHECK_MS
          : chain.lastAccessedAt + this.idleTtlMs
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
