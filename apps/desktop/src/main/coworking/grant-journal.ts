import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { hardenExistingSecureFile, writeSecureFile, writeSecureJsonFile } from '~shared/secure-file'

const COWORKING_VISIBILITY_DENY_JOURNAL_VERSION = 1

type PersistedCoworkingVisibilityDenyJournal = {
  version: typeof COWORKING_VISIBILITY_DENY_JOURNAL_VERSION
  deniedByProfile: Record<string, string[]>
}

export type CoworkingHostOperation = {
  requestId: string
  method: string
  deviceId: string
  deviceName: string
  subject: { nodeId: string; userDisplayName: string }
  hostScopeKey: string
}

export class CoworkingGrantJournal {
  private deniedInstanceIds: Set<string>
  private deniedByProfile: Record<string, string[]>
  private readonly operationFilePath: string

  constructor(
    private readonly filePath: string,
    private readonly profileId: string
  ) {
    if (!profileId) {
      throw new Error('Missing Coworking grant journal profile identity')
    }
    this.operationFilePath = join(dirname(filePath), 'coworking-grant-journal.jsonl')
    hardenExistingSecureFile(this.operationFilePath)
    this.deniedByProfile = this.load()
    this.deniedInstanceIds = new Set(this.deniedByProfile[profileId] ?? [])
  }

  recordHostOperation(operation: CoworkingHostOperation): void {
    this.appendAuditEvent({ kind: 'host-operation', ...operation })
  }

  private appendAuditEvent(event: { kind: string } & Record<string, unknown>): void {
    const line = `${JSON.stringify({
      version: 1,
      profileId: this.profileId,
      occurredAt: Date.now(),
      ...event
    })}\n`
    if (!existsSync(this.operationFilePath)) {
      writeSecureFile(this.operationFilePath, line)
      return
    }
    // Why: the first secure write fixes the file ACL; append-only records keep
    // each privileged invocation durable without rewriting the full history.
    appendFileSync(this.operationFilePath, line, { encoding: 'utf-8', mode: 0o600 })
  }

  snapshotVisibilityDenies(): ReadonlySet<string> {
    return new Set(this.deniedInstanceIds)
  }

  addVisibilityDenies(instanceIds: readonly string[]): void {
    const next = new Set(this.deniedInstanceIds)
    const added: string[] = []
    for (const instanceId of instanceIds) {
      if (instanceId && !next.has(instanceId)) {
        next.add(instanceId)
        added.push(instanceId)
      }
    }
    if (added.length > 0) {
      this.appendAuditEvent({ kind: 'visibility-deny', instanceIds: added.sort() })
    }
    this.replace(next)
  }

  removeVisibilityDenies(instanceIds: readonly string[]): void {
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
      const persisted: PersistedCoworkingVisibilityDenyJournal = {
        version: COWORKING_VISIBILITY_DENY_JOURNAL_VERSION,
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

function isPersistedDenyJournal(value: unknown): value is PersistedCoworkingVisibilityDenyJournal {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.version === COWORKING_VISIBILITY_DENY_JOURNAL_VERSION &&
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
  return new Error('Invalid Coworking visibility deny journal', { cause })
}
