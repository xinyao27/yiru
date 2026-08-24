import { createAdvertisedUrl, shouldReplaceAdvertisedUrl } from './advertised-url-parser'
import {
  advertisedUrlCacheKey,
  dedupeAdvertisedUrlChanges,
  listenerScanStateChanged,
  observedListenersByPort,
  worktreeIdFromAdvertisedUrlCacheKey
} from './advertised-url-scan'
import type {
  AdvertisedUrl,
  AdvertisedUrlChangeEvent,
  AdvertisedUrlListenerObservation,
  ListenerScanState
} from './advertised-url-types'

const MAX_CACHE_ENTRIES = 256

export class AdvertisedUrlCache {
  private readonly cache = new Map<string, AdvertisedUrl>()
  private readonly scanSnapshots = new Map<string, Map<number, number | undefined>>()
  private readonly validationBaselines = new Map<string, ListenerScanState>()
  private readonly startupAbsentAllowances = new Set<string>()
  private readonly emitChange: (event: AdvertisedUrlChangeEvent) => void

  constructor(emitChange: (event: AdvertisedUrlChangeEvent) => void) {
    this.emitChange = emitChange
  }

  consider(url: URL, ptyId: string, worktreeId: string, timestamp: number): void {
    const candidate = createAdvertisedUrl(url, ptyId, timestamp)
    if (!candidate) {
      return
    }
    const key = advertisedUrlCacheKey(worktreeId, candidate.port)
    const existing = this.cache.get(key)
    if (existing && !shouldReplaceAdvertisedUrl(existing, candidate)) {
      existing.lastSeenAt = timestamp
      return
    }
    this.cache.set(key, candidate)
    this.captureValidationBaseline(key, worktreeId, candidate.port)
    const changes = this.enforceLimit()
    if (!existing || existing.origin !== candidate.origin) {
      changes.push({ worktreeId, port: candidate.port })
    }
    this.emitChanges(changes)
  }

  removePty(ptyId: string): void {
    const changes: AdvertisedUrlChangeEvent[] = []
    for (const [key, entry] of this.cache) {
      if (entry.ptyId === ptyId) {
        this.deleteEntry(key)
        changes.push({
          worktreeId: worktreeIdFromAdvertisedUrlCacheKey(key, entry.port),
          port: entry.port
        })
      }
    }
    this.emitChanges(changes)
  }

  forgetWorktree(worktreeId: string): void {
    this.scanSnapshots.delete(worktreeId)
    const changes: AdvertisedUrlChangeEvent[] = []
    for (const [key, entry] of this.cache) {
      if (worktreeIdFromAdvertisedUrlCacheKey(key, entry.port) === worktreeId) {
        this.deleteEntry(key)
        changes.push({ worktreeId, port: entry.port })
      }
    }
    this.emitChanges(changes)
  }

  lookup(worktreeId: string, port: number, currentListenerPid?: number): AdvertisedUrl | undefined {
    const key = advertisedUrlCacheKey(worktreeId, port)
    const entry = this.cache.get(key)
    if (!entry) {
      return undefined
    }
    if (currentListenerPid !== undefined) {
      if (entry.validatedListenerPid === undefined) {
        entry.validatedListenerPid = currentListenerPid
      } else if (entry.validatedListenerPid !== currentListenerPid) {
        this.deleteEntry(key)
        this.emitChange({ worktreeId, port })
        return undefined
      }
    }
    return entry
  }

  invalidate(worktreeId: string, port: number): void {
    const key = advertisedUrlCacheKey(worktreeId, port)
    if (this.cache.has(key)) {
      this.deleteEntry(key)
      this.emitChange({ worktreeId, port })
    } else {
      this.validationBaselines.delete(key)
      this.startupAbsentAllowances.delete(key)
    }
  }

  reconcileScan(
    worktreeIds: readonly string[],
    observations: readonly AdvertisedUrlListenerObservation[]
  ): void {
    const observedByPort = observedListenersByPort(observations)
    const worktreeSet = new Set(worktreeIds)
    const changes: AdvertisedUrlChangeEvent[] = []
    for (const [key, entry] of this.cache) {
      const worktreeId = worktreeIdFromAdvertisedUrlCacheKey(key, entry.port)
      if (!worktreeSet.has(worktreeId)) {
        continue
      }
      const current: ListenerScanState = observedByPort.has(entry.port)
        ? { kind: 'present', pid: observedByPort.get(entry.port) }
        : { kind: 'absent' }
      if (this.shouldEvictAfterScan(key, entry, current)) {
        this.deleteEntry(key)
        changes.push({ worktreeId, port: entry.port })
      } else if (entry.validatedListenerPid === undefined) {
        this.validationBaselines.set(key, current)
      }
    }
    for (const worktreeId of worktreeSet) {
      this.scanSnapshots.set(worktreeId, new Map(observedByPort))
    }
    this.emitChanges(changes)
  }

  lookupBest(
    worktreeIds: readonly string[],
    port: number,
    currentListenerPid?: number
  ): AdvertisedUrl | undefined {
    let best: { worktreeId: string; entry: AdvertisedUrl } | undefined
    for (const worktreeId of worktreeIds) {
      const key = advertisedUrlCacheKey(worktreeId, port)
      const candidate = this.cache.get(key)
      if (!candidate) {
        continue
      }
      if (
        currentListenerPid !== undefined &&
        candidate.validatedListenerPid !== undefined &&
        candidate.validatedListenerPid !== currentListenerPid
      ) {
        this.deleteEntry(key)
        this.emitChange({ worktreeId, port })
        continue
      }
      if (!best || shouldReplaceAdvertisedUrl(best.entry, candidate)) {
        best = { worktreeId, entry: candidate }
      }
    }
    if (best && currentListenerPid !== undefined && best.entry.validatedListenerPid === undefined) {
      best.entry.validatedListenerPid = currentListenerPid
      const key = advertisedUrlCacheKey(best.worktreeId, port)
      this.validationBaselines.delete(key)
      this.startupAbsentAllowances.delete(key)
    }
    return best?.entry
  }

  clear(): void {
    this.cache.clear()
    this.scanSnapshots.clear()
    this.validationBaselines.clear()
    this.startupAbsentAllowances.clear()
  }

  private captureValidationBaseline(key: string, worktreeId: string, port: number): void {
    const baseline = this.currentScanStateFor(worktreeId, port)
    if (!baseline) {
      this.validationBaselines.delete(key)
      this.startupAbsentAllowances.add(key)
      return
    }
    this.validationBaselines.set(key, baseline)
    if (baseline.kind === 'absent') {
      this.startupAbsentAllowances.add(key)
    } else {
      this.startupAbsentAllowances.delete(key)
    }
  }

  private shouldEvictAfterScan(
    key: string,
    entry: AdvertisedUrl,
    current: ListenerScanState
  ): boolean {
    const baseline = this.validationBaselines.get(key)
    if (current.kind === 'absent') {
      if (
        entry.validatedListenerPid === undefined &&
        baseline?.kind !== 'present' &&
        this.startupAbsentAllowances.delete(key)
      ) {
        return false
      }
      return true
    }
    if (
      entry.validatedListenerPid !== undefined &&
      current.pid !== undefined &&
      entry.validatedListenerPid !== current.pid
    ) {
      return true
    }
    if (baseline?.kind === 'absent') {
      this.startupAbsentAllowances.delete(key)
      // Why: a server can print its banner before the OS scan sees its listener.
      return false
    }
    return (
      entry.validatedListenerPid === undefined &&
      baseline !== undefined &&
      listenerScanStateChanged(baseline, current)
    )
  }

  private currentScanStateFor(worktreeId: string, port: number): ListenerScanState | undefined {
    const snapshot = this.scanSnapshots.get(worktreeId)
    if (!snapshot) {
      return undefined
    }
    return snapshot.has(port) ? { kind: 'present', pid: snapshot.get(port) } : { kind: 'absent' }
  }

  private enforceLimit(): AdvertisedUrlChangeEvent[] {
    if (this.cache.size <= MAX_CACHE_ENTRIES) {
      return []
    }
    const entries = Array.from(this.cache.entries()).sort(
      (left, right) => left[1].lastSeenAt - right[1].lastSeenAt
    )
    const overflow = this.cache.size - MAX_CACHE_ENTRIES
    const changes: AdvertisedUrlChangeEvent[] = []
    for (let index = 0; index < overflow; index++) {
      const [key, entry] = entries[index]
      this.deleteEntry(key)
      changes.push({
        worktreeId: worktreeIdFromAdvertisedUrlCacheKey(key, entry.port),
        port: entry.port
      })
    }
    return changes
  }

  private deleteEntry(key: string): void {
    this.cache.delete(key)
    this.validationBaselines.delete(key)
    this.startupAbsentAllowances.delete(key)
  }

  private emitChanges(changes: AdvertisedUrlChangeEvent[]): void {
    for (const event of dedupeAdvertisedUrlChanges(changes)) {
      this.emitChange(event)
    }
  }
}
