import { COWORKING_SESSION_PROVENANCE_MAX_ENTRIES } from './session-provenance-index'
import type {
  CoworkingResolvedHistoricalSession,
  CoworkingResolvedSession
} from './session-resolution'
import type {
  CoworkingOwnerHistoricalSessionRecord,
  CoworkingSessionWorktreeIdentity
} from './session-source'

const MAX_CACHED_HISTORICAL_RECORD_BYTES = 128 * 1024 * 1024

type CachedSessionInventory = {
  worktreeInstanceId: string
  sessions: Map<string, CoworkingResolvedSession>
  historicalRecords: Map<string, CoworkingOwnerHistoricalSessionRecord>
}

/** Pins proven records from successful pages, so pagination cannot outgrow the scan LRU. */
export class CoworkingSessionInventoryCache {
  private readonly inventories = new Map<string, CachedSessionInventory>()
  private historicalRecordCount = 0
  private historicalRecordBytes = 0

  mergePage(
    worktree: CoworkingSessionWorktreeIdentity,
    sessions: readonly CoworkingResolvedSession[],
    historicalRecords: ReadonlyMap<string, CoworkingOwnerHistoricalSessionRecord>
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
    worktree: CoworkingSessionWorktreeIdentity,
    sessionKey: string
  ): CoworkingResolvedSession | null {
    return this.inventories.get(inventoryKey(worktree))?.sessions.get(sessionKey) ?? null
  }

  resolveHistoricalRecord(
    session: CoworkingResolvedHistoricalSession
  ): CoworkingOwnerHistoricalSessionRecord | null {
    const inventory = this.inventories.get(
      inventoryKeyFromParts(
        session.executionHostId,
        session.actualHostScope,
        session.worktreeInstanceId,
        session.coworkingIncarnationId
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
    recordCount > COWORKING_SESSION_PROVENANCE_MAX_ENTRIES ||
    recordBytes > MAX_CACHED_HISTORICAL_RECORD_BYTES
  ) {
    // Why: resource pressure must fail the inventory, never silently mark a prefix complete.
    throw new Error('Coworking historical session inventory cache capacity exceeded')
  }
}

function historicalRecordSize(record: CoworkingOwnerHistoricalSessionRecord): number {
  return Buffer.byteLength(
    `${record.ownerRecordKey}\0${record.executionHostId}\0${record.actualHostScope}\0${record.worktreeInstanceId}\0${record.coworkingIncarnationId}\0${record.providerSessionId}\0${record.title}\0${record.transcriptPath}\0${record.resumeCommand}`,
    'utf8'
  )
}

function inventoryKey(worktree: CoworkingSessionWorktreeIdentity): string {
  return inventoryKeyFromParts(
    worktree.target.executionHostId,
    worktree.actualHostScope,
    worktree.instanceId,
    worktree.coworkingIncarnationId
  )
}

function inventoryKeyFromParts(
  executionHostId: string,
  actualHostScope: string,
  worktreeInstanceId: string,
  coworkingIncarnationId: string
): string {
  return JSON.stringify([
    executionHostId,
    actualHostScope,
    worktreeInstanceId,
    coworkingIncarnationId
  ])
}

export function matchesHistoricalSession(
  record: CoworkingOwnerHistoricalSessionRecord,
  session: CoworkingResolvedHistoricalSession
): boolean {
  return (
    record.ownerRecordKey === session.ownerRecordKey &&
    record.executionHostId === session.executionHostId &&
    record.actualHostScope === session.actualHostScope &&
    record.worktreeInstanceId === session.worktreeInstanceId &&
    record.coworkingIncarnationId === session.coworkingIncarnationId &&
    record.provider === session.provider &&
    record.providerSessionId === session.providerSessionId
  )
}
