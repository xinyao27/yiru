import { waitForSessionInventoryAbort } from './session-inventory-abort'

const DEFAULT_MAX_SNAPSHOTS = 256
const DEFAULT_IDLE_TTL_MS = 15 * 60_000

type SnapshotEntry<TSnapshot extends object> = {
  key: string
  snapshot: TSnapshot
  lastAccessedAt: number
  retainedBytes: number
  activeLeases: number
  cacheable: boolean
}

type SnapshotOpening<TSnapshot extends object> = {
  promise: Promise<TSnapshot>
  controller: AbortController
  generation: number
  entry: SnapshotEntry<TSnapshot> | null
  waiters: number
  settled: boolean
}

export type SessionInventorySnapshotCacheOptions<TSnapshot> = {
  maxSnapshots?: number
  idleTtlMs?: number
  maxRetainedBytes?: number
  openingReservationBytes?: number
  measureSnapshotBytes?: (snapshot: TSnapshot) => number
}

/** Shares one frozen host discovery while retaining active cursor leases within a byte budget. */
export class SessionInventorySnapshotCache<TSnapshot extends object> {
  private readonly snapshots = new Map<string, SnapshotEntry<TSnapshot>>()
  private readonly entries = new Set<SnapshotEntry<TSnapshot>>()
  private readonly entryBySnapshot = new WeakMap<TSnapshot, SnapshotEntry<TSnapshot>>()
  private readonly openings = new Map<string, SnapshotOpening<TSnapshot>>()
  private readonly pendingOpeningCounts = new Map<string, number>()
  private readonly generations = new Map<string, number>()
  private readonly maxSnapshots: number
  private readonly idleTtlMs: number
  private readonly maxRetainedBytes: number
  private readonly openingReservationBytes: number
  private readonly measureSnapshotBytes: (snapshot: TSnapshot) => number
  private retainedBytes = 0
  private pendingOpenings = 0
  private expiryTimer: NodeJS.Timeout | null = null

  constructor(options: SessionInventorySnapshotCacheOptions<TSnapshot> = {}) {
    this.maxSnapshots = options.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS
    this.maxRetainedBytes = options.maxRetainedBytes ?? Number.POSITIVE_INFINITY
    this.openingReservationBytes = options.openingReservationBytes ?? 0
    this.measureSnapshotBytes = options.measureSnapshotBytes ?? (() => 0)
  }

  async resolve(
    key: string,
    open: (signal: AbortSignal) => Promise<TSnapshot>,
    signal?: AbortSignal
  ): Promise<TSnapshot> {
    signal?.throwIfAborted()
    this.expireIdle()
    const cached = this.snapshots.get(key)
    if (cached) {
      return this.acquireEntry(cached)
    }
    let opening = this.openings.get(key)
    if (!opening) {
      opening = this.createOpening(key, open)
    }
    opening.waiters++
    try {
      const snapshot = await waitForSessionInventoryAbort(opening.promise, signal)
      signal?.throwIfAborted()
      return this.acquireSnapshot(snapshot)
    } finally {
      this.releaseOpeningWaiter(key, opening, signal?.aborted ?? false)
    }
  }

  release(snapshot: TSnapshot): void {
    const entry = this.entryBySnapshot.get(snapshot)
    if (!entry || entry.activeLeases === 0) {
      return
    }
    entry.activeLeases--
    entry.lastAccessedAt = Date.now()
    if (entry.activeLeases === 0 && !entry.cacheable) {
      this.deleteEntry(entry)
    }
    this.scheduleExpiry()
  }

  invalidate(key: string): void {
    this.generations.set(key, this.generation(key) + 1)
    const opening = this.openings.get(key)
    if (opening) {
      this.openings.delete(key)
      opening.controller.abort()
    }
    const entry = this.snapshots.get(key)
    if (entry) {
      entry.cacheable = false
      this.snapshots.delete(key)
      if (entry.activeLeases === 0) {
        this.deleteEntry(entry)
      }
    }
    this.deleteIdleGeneration(key)
    this.scheduleExpiry()
  }

  private async openAndRetain(
    key: string,
    generation: number,
    open: (signal: AbortSignal) => Promise<TSnapshot>,
    signal: AbortSignal
  ): Promise<TSnapshot> {
    const snapshot = await open(signal)
    signal.throwIfAborted()
    if (generation !== this.generation(key)) {
      throw new Error('AI Vault session inventory snapshot was invalidated during creation')
    }
    const retainedBytes = this.measureSnapshotBytes(snapshot)
    if (!Number.isSafeInteger(retainedBytes) || retainedBytes < 0) {
      throw new Error('AI Vault session inventory snapshot size is invalid')
    }
    this.requireRetainedCapacity(
      retainedBytes + Math.max(0, this.pendingOpenings - 1) * this.openingReservationBytes
    )
    const entry: SnapshotEntry<TSnapshot> = {
      key,
      snapshot,
      lastAccessedAt: Date.now(),
      retainedBytes,
      activeLeases: 0,
      cacheable: true
    }
    this.snapshots.set(key, entry)
    this.entries.add(entry)
    this.entryBySnapshot.set(snapshot, entry)
    this.retainedBytes += retainedBytes
    this.scheduleExpiry()
    return snapshot
  }

  private acquireSnapshot(snapshot: TSnapshot): TSnapshot {
    const entry = this.entryBySnapshot.get(snapshot)
    if (!entry?.cacheable || this.snapshots.get(entry.key) !== entry) {
      throw new Error('AI Vault session inventory snapshot is no longer available')
    }
    return this.acquireEntry(entry)
  }

  private acquireEntry(entry: SnapshotEntry<TSnapshot>): TSnapshot {
    entry.activeLeases++
    entry.lastAccessedAt = Date.now()
    this.scheduleExpiry()
    return entry.snapshot
  }

  private requireSnapshotSlot(): void {
    while (this.entries.size + this.pendingOpenings >= this.maxSnapshots) {
      if (!this.evictOldestIdleEntry()) {
        throw new Error('AI Vault session inventory snapshot capacity exceeded')
      }
    }
  }

  private requireRetainedCapacity(additionalBytes: number): void {
    while (this.retainedBytes + additionalBytes > this.maxRetainedBytes) {
      if (!this.evictOldestIdleEntry()) {
        throw new Error('AI Vault session inventory snapshot memory capacity exceeded')
      }
    }
  }

  private evictOldestIdleEntry(): boolean {
    let oldest: SnapshotEntry<TSnapshot> | null = null
    for (const entry of this.entries) {
      if (entry.activeLeases === 0 && (!oldest || entry.lastAccessedAt < oldest.lastAccessedAt)) {
        oldest = entry
      }
    }
    if (!oldest) {
      return false
    }
    this.deleteEntry(oldest)
    return true
  }

  private expireIdle(): void {
    const cutoff = Date.now() - this.idleTtlMs
    for (const entry of this.entries) {
      if (entry.activeLeases === 0 && entry.lastAccessedAt < cutoff) {
        this.deleteEntry(entry)
      }
    }
    this.scheduleExpiry()
  }

  private deleteEntry(entry: SnapshotEntry<TSnapshot>): void {
    if (!this.entries.delete(entry)) {
      return
    }
    if (this.snapshots.get(entry.key) === entry) {
      this.snapshots.delete(entry.key)
    }
    this.entryBySnapshot.delete(entry.snapshot)
    this.retainedBytes -= entry.retainedBytes
  }

  private generation(key: string): number {
    return this.generations.get(key) ?? 0
  }

  private deleteIdleGeneration(key: string): void {
    // Why: random inventory scopes must not leave permanent generation tombstones.
    if (!this.pendingOpeningCounts.has(key) && !this.snapshots.has(key)) {
      this.generations.delete(key)
    }
  }

  private createOpening(
    key: string,
    open: (signal: AbortSignal) => Promise<TSnapshot>
  ): SnapshotOpening<TSnapshot> {
    this.requireSnapshotSlot()
    this.requireRetainedCapacity((this.pendingOpenings + 1) * this.openingReservationBytes)
    const controller = new AbortController()
    const opening: SnapshotOpening<TSnapshot> = {
      promise: Promise.resolve(null as unknown as TSnapshot),
      controller,
      generation: this.generation(key),
      entry: null,
      waiters: 0,
      settled: false
    }
    this.rememberPendingOpening(key)
    opening.promise = (async () => {
      try {
        const snapshot = await this.openAndRetain(key, opening.generation, open, controller.signal)
        opening.entry = this.entryBySnapshot.get(snapshot) ?? null
        return snapshot
      } finally {
        opening.settled = true
        this.forgetPendingOpening(key)
        if (opening.waiters === 0 && this.openings.get(key) === opening) {
          this.openings.delete(key)
        }
        this.deleteIdleGeneration(key)
      }
    })()
    this.openings.set(key, opening)
    return opening
  }

  private releaseOpeningWaiter(
    key: string,
    opening: SnapshotOpening<TSnapshot>,
    abandoned: boolean
  ): void {
    opening.waiters--
    if (opening.waiters > 0) {
      return
    }
    const isCurrentOpening = this.openings.get(key) === opening
    if (isCurrentOpening) {
      this.openings.delete(key)
    }
    if (!opening.settled) {
      // Why: an abandoned opening may finish late, but its result must never enter the cache.
      if (isCurrentOpening) {
        this.generations.set(key, this.generation(key) + 1)
        opening.controller.abort()
      }
    } else if (abandoned) {
      // Why: an invalidated opening can settle beside its replacement; only
      // discard the entry produced by the abandoned opening itself.
      const entry = opening.entry
      if (entry?.activeLeases === 0) {
        this.deleteEntry(entry)
      }
    }
    this.deleteIdleGeneration(key)
  }

  private rememberPendingOpening(key: string): void {
    this.pendingOpenings++
    this.pendingOpeningCounts.set(key, (this.pendingOpeningCounts.get(key) ?? 0) + 1)
  }

  private forgetPendingOpening(key: string): void {
    this.pendingOpenings--
    const remaining = (this.pendingOpeningCounts.get(key) ?? 1) - 1
    if (remaining === 0) {
      this.pendingOpeningCounts.delete(key)
    } else {
      this.pendingOpeningCounts.set(key, remaining)
    }
  }

  private scheduleExpiry(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer)
      this.expiryTimer = null
    }
    const idleEntries = [...this.entries].filter((entry) => entry.activeLeases === 0)
    if (idleEntries.length === 0) {
      return
    }
    const nextExpiryAt = Math.min(
      ...idleEntries.map((entry) => entry.lastAccessedAt + this.idleTtlMs)
    )
    this.expiryTimer = setTimeout(
      () => {
        this.expiryTimer = null
        this.expireIdle()
      },
      Math.max(1, nextExpiryAt - Date.now())
    )
    this.expiryTimer.unref()
  }
}
