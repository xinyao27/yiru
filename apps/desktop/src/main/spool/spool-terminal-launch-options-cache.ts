import type { TuiAgent } from '../../shared/types'
import { SpoolExecutionError } from './spool-execution-error'

const LAUNCH_OPTIONS_TTL_MS = 30_000
const MAX_ACTUAL_HOST_ENTRIES = 64

type LaunchOptionsCacheEntry = {
  promise: Promise<readonly TuiAgent[]>
  expiresAt: number | null
}

/** Coalesces PATH probes per actual host so opening a launch menu stays cheap. */
export class SpoolTerminalLaunchOptionsCache {
  private readonly entries = new Map<string, LaunchOptionsCacheEntry>()

  read(
    actualHostScope: string,
    detect: () => Promise<readonly TuiAgent[]>
  ): Promise<readonly TuiAgent[]> {
    return this.readEntry(actualHostScope, detect, false)
  }

  refresh(
    actualHostScope: string,
    detect: () => Promise<readonly TuiAgent[]>
  ): Promise<readonly TuiAgent[]> {
    return this.readEntry(actualHostScope, detect, true)
  }

  private readEntry(
    actualHostScope: string,
    detect: () => Promise<readonly TuiAgent[]>,
    forceFresh: boolean
  ): Promise<readonly TuiAgent[]> {
    this.pruneExpired()
    const existing = this.entries.get(actualHostScope)
    if (existing && (!forceFresh || existing.expiresAt === null)) {
      return existing.promise
    }
    if (existing) {
      this.entries.delete(actualHostScope)
    }
    this.reserveCapacity()
    const promise = Promise.resolve().then(detect)
    const entry: LaunchOptionsCacheEntry = { promise, expiresAt: null }
    this.entries.set(actualHostScope, entry)
    void promise.then(
      () => {
        if (this.entries.get(actualHostScope) !== entry) {
          return
        }
        entry.expiresAt = Date.now() + LAUNCH_OPTIONS_TTL_MS
        this.entries.delete(actualHostScope)
        this.entries.set(actualHostScope, entry)
      },
      () => {
        if (this.entries.get(actualHostScope) === entry) {
          this.entries.delete(actualHostScope)
        }
      }
    )
    return promise
  }

  private pruneExpired(now = Date.now()): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.entries.delete(key)
      }
    }
  }

  private reserveCapacity(): void {
    while (this.entries.size >= MAX_ACTUAL_HOST_ENTRIES) {
      const settled = [...this.entries].find(([, entry]) => entry.expiresAt !== null)
      if (!settled) {
        throw new SpoolExecutionError('resource_busy')
      }
      this.entries.delete(settled[0])
    }
  }
}
