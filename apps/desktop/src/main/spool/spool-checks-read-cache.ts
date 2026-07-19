import type { SpoolChecksReadResult } from '../../shared/spool/spool-operation-contract'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

const CHECKS_CACHE_TTL_MS = 15_000
const MAX_CHECKS_CACHE_ENTRIES = 128

type SpoolChecksReadCacheEntry = {
  promise: Promise<SpoolChecksReadResult>
  controller: AbortController
  expiresAt: number | null
  settled: boolean
  waiterCount: number
}

/** Coalesces provider-backed Checks reads without retaining them across publication identities. */
export class SpoolChecksReadCache {
  private readonly entries = new Map<string, SpoolChecksReadCacheEntry>()

  read(
    target: SpoolPublicWorktreeInstance,
    signal: AbortSignal,
    load: (signal: AbortSignal) => Promise<SpoolChecksReadResult>
  ): Promise<SpoolChecksReadResult> {
    signal.throwIfAborted()
    this.pruneExpired()
    const key = checksCacheKey(target)
    const existing = this.entries.get(key)
    if (existing) {
      return this.waitForEntry(key, existing, signal)
    }
    this.reserveCapacity()
    const controller = new AbortController()
    const promise = Promise.resolve().then(() => load(controller.signal))
    const entry: SpoolChecksReadCacheEntry = {
      promise,
      controller,
      expiresAt: null,
      settled: false,
      waiterCount: 0
    }
    this.entries.set(key, entry)
    void promise.then(
      () => {
        entry.settled = true
        if (this.entries.get(key) !== entry) {
          return
        }
        entry.expiresAt = Date.now() + CHECKS_CACHE_TTL_MS
        this.entries.delete(key)
        this.entries.set(key, entry)
      },
      () => {
        entry.settled = true
        if (this.entries.get(key) === entry) {
          this.entries.delete(key)
        }
      }
    )
    return this.waitForEntry(key, entry, signal)
  }

  private waitForEntry(
    key: string,
    entry: SpoolChecksReadCacheEntry,
    signal: AbortSignal
  ): Promise<SpoolChecksReadResult> {
    signal.throwIfAborted()
    entry.waiterCount += 1
    return waitForChecksRead(entry.promise, signal, () => {
      entry.waiterCount -= 1
      if (entry.waiterCount !== 0 || entry.settled) {
        return
      }
      // Why: a coalesced provider read serves only its active RPC waiters; once all
      // disconnect, keeping the owner-side CLI/API request alive wastes a bounded lane.
      if (this.entries.get(key) === entry) {
        this.entries.delete(key)
      }
      entry.controller.abort(signal.reason)
    })
  }

  private pruneExpired(now = Date.now()): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.entries.delete(key)
      }
    }
  }

  private reserveCapacity(): void {
    while (this.entries.size >= MAX_CHECKS_CACHE_ENTRIES) {
      const settled = [...this.entries].find(([, entry]) => entry.expiresAt !== null)
      if (!settled) {
        throw new SpoolExecutionError('resource_busy')
      }
      this.entries.delete(settled[0])
    }
  }
}

function checksCacheKey(target: SpoolPublicWorktreeInstance): string {
  return JSON.stringify([
    target.actualHostScope,
    target.instanceId,
    target.shareEpoch,
    target.spoolIncarnationId
  ])
}

function waitForChecksRead(
  promise: Promise<SpoolChecksReadResult>,
  signal: AbortSignal,
  release: () => void
): Promise<SpoolChecksReadResult> {
  return new Promise((resolve, reject) => {
    let finished = false
    const finish = (): boolean => {
      if (finished) {
        return false
      }
      finished = true
      signal.removeEventListener('abort', abort)
      release()
      return true
    }
    const abort = (): void => {
      if (finish()) {
        reject(signal.reason ?? new Error('aborted'))
      }
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    void promise.then(
      (result) => {
        if (finish()) {
          resolve(result)
        }
      },
      (error) => {
        if (finish()) {
          reject(error)
        }
      }
    )
  })
}
