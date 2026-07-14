import { existsSync, readFileSync, rmSync } from 'node:fs'
import { hardenExistingSecureFile, writeSecureJsonFile } from '../../shared/secure-file'

const SPOOL_VISIBILITY_DENY_JOURNAL_VERSION = 1

type PersistedSpoolVisibilityDenyJournal = {
  version: typeof SPOOL_VISIBILITY_DENY_JOURNAL_VERSION
  deniedByProfile: Record<string, string[]>
}

export class SpoolVisibilityDenyJournal {
  private deniedInstanceIds: Set<string>
  private deniedByProfile: Record<string, string[]>

  constructor(
    private readonly filePath: string,
    private readonly profileId: string
  ) {
    if (!profileId) {
      throw new Error('Missing Spool visibility profile identity')
    }
    this.deniedByProfile = this.load()
    this.deniedInstanceIds = new Set(this.deniedByProfile[profileId] ?? [])
  }

  snapshot(): ReadonlySet<string> {
    return new Set(this.deniedInstanceIds)
  }

  add(instanceIds: readonly string[]): void {
    const next = new Set(this.deniedInstanceIds)
    for (const instanceId of instanceIds) {
      if (instanceId) {
        next.add(instanceId)
      }
    }
    this.replace(next)
  }

  remove(instanceIds: readonly string[]): void {
    const next = new Set(this.deniedInstanceIds)
    for (const instanceId of instanceIds) {
      next.delete(instanceId)
    }
    this.replace(next)
  }

  private replace(next: Set<string>): void {
    if (setsEqual(this.deniedInstanceIds, next)) {
      return
    }
    const deniedByProfile = { ...this.deniedByProfile }
    if (next.size === 0) {
      delete deniedByProfile[this.profileId]
    } else {
      deniedByProfile[this.profileId] = [...next].sort()
    }
    if (Object.keys(deniedByProfile).length === 0) {
      if (existsSync(this.filePath)) {
        // Why: deleting only after Private metadata commits makes a crash leave
        // an extra deny entry, never an accidentally re-published worktree.
        rmSync(this.filePath)
      }
    } else {
      const persisted: PersistedSpoolVisibilityDenyJournal = {
        version: SPOOL_VISIBILITY_DENY_JOURNAL_VERSION,
        deniedByProfile
      }
      writeSecureJsonFile(this.filePath, persisted)
    }
    this.deniedByProfile = deniedByProfile
    this.deniedInstanceIds = next
  }

  private load(): Record<string, string[]> {
    if (!existsSync(this.filePath)) {
      return {}
    }
    hardenExistingSecureFile(this.filePath)
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    } catch (error) {
      throw invalidJournalError(error)
    }
    if (!isPersistedDenyJournal(parsed)) {
      throw invalidJournalError()
    }
    return parsed.deniedByProfile
  }
}

function isPersistedDenyJournal(value: unknown): value is PersistedSpoolVisibilityDenyJournal {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.version === SPOOL_VISIBILITY_DENY_JOURNAL_VERSION &&
    isDeniedByProfile(record.deniedByProfile)
  )
}

function isDeniedByProfile(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.entries(value).every(
    ([profileId, entries]) =>
      profileId.length > 0 &&
      Array.isArray(entries) &&
      entries.every((entry) => typeof entry === 'string' && entry.length > 0)
  )
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((entry) => right.has(entry))
}

function invalidJournalError(cause?: unknown): Error {
  return new Error('Invalid Spool visibility deny journal', { cause })
}
