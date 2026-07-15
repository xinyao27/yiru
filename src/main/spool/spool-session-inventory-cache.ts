import type {
  SpoolOwnerHistoricalSessionRecord,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type {
  SpoolResolvedHistoricalSession,
  SpoolResolvedSession
} from './spool-session-resolution'
import { SPOOL_SESSION_PROVENANCE_MAX_ENTRIES } from './spool-session-provenance-index'

const MAX_CACHED_HISTORICAL_RECORD_BYTES = 128 * 1024 * 1024

type CachedSessionInventory = {
  worktreeInstanceId: string
  sessions: Map<string, SpoolResolvedSession>
  historicalRecords: Map<string, SpoolOwnerHistoricalSessionRecord>
}

/** Pins proven records from successful pages, so pagination cannot outgrow the scan LRU. */
export class SpoolSessionInventoryCache {
  private readonly inventories = new Map<string, CachedSessionInventory>()
  private historicalRecordCount = 0
  private historicalRecordBytes = 0

  mergePage(
    worktree: SpoolSessionWorktreeIdentity,
    sessions: readonly SpoolResolvedSession[],
    historicalRecords: ReadonlyMap<string, SpoolOwnerHistoricalSessionRecord>
  ): void {
    const key = inventoryKey(worktree)
    let inventory = this.inventories.get(key)
    let recordCountDelta = 0
    let recordBytesDelta = 0
    let replacedRecordCount = 0
    let replacedRecordBytes = 0
    if (!inventory) {
      for (const candidate of this.inventories.values()) {
        if (candidate.worktreeInstanceId !== worktree.instanceId) {
          continue
        }
        replacedRecordCount += candidate.historicalRecords.size
        for (const record of candidate.historicalRecords.values()) {
          replacedRecordBytes += historicalRecordSize(record)
        }
      }
    }
    for (const [recordKey, record] of historicalRecords) {
      const existing = inventory?.historicalRecords.get(recordKey)
      if (!existing) {
        recordCountDelta++
      } else {
        recordBytesDelta -= historicalRecordSize(existing)
      }
      recordBytesDelta += historicalRecordSize(record)
    }
    requireWithinCacheBudget(
      this.historicalRecordCount - replacedRecordCount + recordCountDelta,
      this.historicalRecordBytes - replacedRecordBytes + recordBytesDelta
    )
    if (!inventory) {
      this.clearInstance(worktree.instanceId)
      inventory = {
        worktreeInstanceId: worktree.instanceId,
        sessions: new Map(),
        historicalRecords: new Map()
      }
      this.inventories.set(key, inventory)
    }
    for (const session of sessions) {
      inventory.sessions.set(session.sessionKey, session)
    }
    for (const [recordKey, record] of historicalRecords) {
      inventory.historicalRecords.set(recordKey, record)
    }
    this.historicalRecordCount += recordCountDelta
    this.historicalRecordBytes += recordBytesDelta
  }

  resolveSession(
    worktree: SpoolSessionWorktreeIdentity,
    sessionKey: string
  ): SpoolResolvedSession | null {
    return this.inventories.get(inventoryKey(worktree))?.sessions.get(sessionKey) ?? null
  }

  resolveHistoricalRecord(
    session: SpoolResolvedHistoricalSession
  ): SpoolOwnerHistoricalSessionRecord | null {
    const inventory = this.inventories.get(
      inventoryKeyFromParts(
        session.executionHostId,
        session.actualHostScope,
        session.worktreeInstanceId,
        session.spoolIncarnationId
      )
    )
    const record = inventory?.historicalRecords.get(session.ownerRecordKey)
    return record && matchesHistoricalSession(record, session) ? { ...record } : null
  }

  clear(): void {
    this.inventories.clear()
    this.historicalRecordCount = 0
    this.historicalRecordBytes = 0
  }

  clearInstance(instanceId: string): void {
    for (const [key, inventory] of this.inventories) {
      if (inventory.worktreeInstanceId === instanceId) {
        this.historicalRecordCount -= inventory.historicalRecords.size
        for (const record of inventory.historicalRecords.values()) {
          this.historicalRecordBytes -= historicalRecordSize(record)
        }
        this.inventories.delete(key)
      }
    }
  }
}

function requireWithinCacheBudget(recordCount: number, recordBytes: number): void {
  if (
    recordCount > SPOOL_SESSION_PROVENANCE_MAX_ENTRIES ||
    recordBytes > MAX_CACHED_HISTORICAL_RECORD_BYTES
  ) {
    // Why: resource pressure must fail the inventory, never silently mark a prefix complete.
    throw new Error('Spool historical session inventory cache capacity exceeded')
  }
}

function historicalRecordSize(record: SpoolOwnerHistoricalSessionRecord): number {
  return Buffer.byteLength(
    `${record.ownerRecordKey}\0${record.executionHostId}\0${record.actualHostScope}\0${record.worktreeInstanceId}\0${record.spoolIncarnationId}\0${record.providerSessionId}\0${record.title}\0${record.transcriptPath}\0${record.resumeCommand}`,
    'utf8'
  )
}

function inventoryKey(worktree: SpoolSessionWorktreeIdentity): string {
  return inventoryKeyFromParts(
    worktree.target.executionHostId,
    worktree.actualHostScope,
    worktree.instanceId,
    worktree.spoolIncarnationId
  )
}

function inventoryKeyFromParts(
  executionHostId: string,
  actualHostScope: string,
  worktreeInstanceId: string,
  spoolIncarnationId: string
): string {
  return JSON.stringify([executionHostId, actualHostScope, worktreeInstanceId, spoolIncarnationId])
}

export function matchesHistoricalSession(
  record: SpoolOwnerHistoricalSessionRecord,
  session: SpoolResolvedHistoricalSession
): boolean {
  return (
    record.ownerRecordKey === session.ownerRecordKey &&
    record.executionHostId === session.executionHostId &&
    record.actualHostScope === session.actualHostScope &&
    record.worktreeInstanceId === session.worktreeInstanceId &&
    record.spoolIncarnationId === session.spoolIncarnationId &&
    record.provider === session.provider &&
    record.providerSessionId === session.providerSessionId
  )
}
