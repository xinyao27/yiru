import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { PersistedState } from '../../shared/types'

function cachePath(dataFile: string): string {
  return join(dirname(dataFile), 'yiru-github-cache.json')
}

export class GitHubCacheFile {
  // Why: this refetchable cache changes every poll; a sidecar avoids rewriting
  // the multi-MB durable document while preserving fast startup badges.
  private dirty = false

  constructor(private readonly dataFile: string) {}

  read(): PersistedState['githubCache'] | null {
    try {
      const parsed = JSON.parse(readFileSync(cachePath(this.dataFile), 'utf-8')) as unknown
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        (parsed as { pr?: unknown }).pr &&
        typeof (parsed as { pr: unknown }).pr === 'object' &&
        !Array.isArray((parsed as { pr: unknown }).pr)
      ) {
        return { pr: (parsed as PersistedState['githubCache']).pr }
      }
    } catch {
      // Missing or corrupt cache is refetched and never blocks durable state.
    }
    return null
  }

  markDirty(): void {
    this.dirty = true
  }

  writeIfDirty(cache: PersistedState['githubCache']): void {
    if (!this.dirty) {
      return
    }
    const target = cachePath(this.dataFile)
    const temporary = `${target}.${process.pid}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify(cache), 'utf-8')
      renameSync(temporary, target)
      this.dirty = false
    } catch (error) {
      try {
        unlinkSync(temporary)
      } catch {
        // Best-effort cleanup after a non-durable cache write failed.
      }
      console.warn('[persistence] Failed to write github cache snapshot:', error)
    }
  }
}
