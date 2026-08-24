import { AdvertisedUrlCache } from './advertised-url-cache'
import { AdvertisedUrlInput } from './advertised-url-input'
import type {
  AdvertisedUrl,
  AdvertisedUrlChangeEvent,
  AdvertisedUrlListenerObservation
} from './advertised-url-types'

export { classifyHost, extractUrlCandidates, stripTerminalControls } from './advertised-url-parser'
export type {
  AdvertisedUrl,
  AdvertisedUrlChangeEvent,
  AdvertisedUrlListenerObservation,
  HostKind
} from './advertised-url-types'

export class AdvertisedUrlWatcher {
  private readonly listeners = new Set<(event: AdvertisedUrlChangeEvent) => void>()
  private readonly cache: AdvertisedUrlCache
  private readonly input: AdvertisedUrlInput

  constructor() {
    this.cache = new AdvertisedUrlCache((event) => this.emitChange(event))
    this.input = new AdvertisedUrlInput((url, ptyId, worktreeId, timestamp) => {
      this.cache.consider(url, ptyId, worktreeId, timestamp)
    })
  }

  onDidChange(listener: (event: AdvertisedUrlChangeEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  bindPty(ptyId: string, worktreeId: string): void {
    this.input.bindPty(ptyId, worktreeId)
  }

  unbindPty(ptyId: string): void {
    this.input.unbindPty(ptyId)
    // Why: SSH enrichment has no listener PID, so PTY teardown is its only
    // reliable cache-expiry signal.
    this.cache.removePty(ptyId)
  }

  forgetWorktree(worktreeId: string): void {
    this.input.forgetWorktree(worktreeId)
    this.cache.forgetWorktree(worktreeId)
  }

  ingest(ptyId: string, chunk: string, now?: number): void {
    this.input.ingest(ptyId, chunk, now)
  }

  lookup(worktreeId: string, port: number, currentListenerPid?: number): AdvertisedUrl | undefined {
    return this.cache.lookup(worktreeId, port, currentListenerPid)
  }

  invalidate(worktreeId: string, port: number): void {
    this.cache.invalidate(worktreeId, port)
  }

  reconcileScan(
    worktreeIds: readonly string[],
    observations: readonly AdvertisedUrlListenerObservation[]
  ): void {
    this.cache.reconcileScan(worktreeIds, observations)
  }

  lookupBest(
    worktreeIds: readonly string[],
    port: number,
    currentListenerPid?: number
  ): AdvertisedUrl | undefined {
    return this.cache.lookupBest(worktreeIds, port, currentListenerPid)
  }

  clear(): void {
    this.input.clear()
    this.cache.clear()
  }

  private emitChange(event: AdvertisedUrlChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.warn('[advertised-url-watcher] listener failed', error)
      }
    }
  }
}

export const advertisedUrlWatcher = new AdvertisedUrlWatcher()
