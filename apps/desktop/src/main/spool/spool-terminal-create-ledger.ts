import type {
  SpoolTerminalCreateHostResult,
  SpoolTerminalCreateOperation
} from '../../shared/spool/spool-operation-contract'
import { SpoolExecutionError } from './spool-execution-error'

const MAX_INFLIGHT_PER_CONNECTION_WORKTREE = 4
const MAX_RECORDS_PER_CONNECTION_WORKTREE = 256
const MAX_LEDGER_ENTRIES = 2_048

type TerminalCreateLedgerEntry = {
  connectionId: string
  instanceId: string
  shareEpoch: string
  spoolIncarnationId: string
  fingerprint: string
  promise: Promise<SpoolTerminalCreateHostResult>
  settled: boolean
}

type TerminalCreateLedgerKey = {
  connectionId: string
  instanceId: string
  shareEpoch: string
  spoolIncarnationId: string
  clientMutationId: string
  fingerprint: string
}

/** Deduplicates ambiguous terminal-create retries for one physical connection. */
export class SpoolTerminalCreateLedger {
  private readonly entries = new Map<string, TerminalCreateLedgerEntry>()

  run(
    key: TerminalCreateLedgerKey,
    create: () => Promise<SpoolTerminalCreateHostResult>
  ): Promise<SpoolTerminalCreateHostResult> {
    const ledgerKey = createLedgerKey(key)
    const existing = this.entries.get(ledgerKey)
    if (existing) {
      if (existing.fingerprint !== key.fingerprint) {
        throw new SpoolExecutionError('invalid_argument')
      }
      return existing.promise
    }
    if (this.inflightFor(key) >= MAX_INFLIGHT_PER_CONNECTION_WORKTREE) {
      throw new SpoolExecutionError('resource_busy')
    }
    if (
      this.recordsFor(key) >= MAX_RECORDS_PER_CONNECTION_WORKTREE ||
      this.entries.size >= MAX_LEDGER_ENTRIES
    ) {
      // Why: evicting an older outcome would make its mutation id unsafe to retry.
      throw new SpoolExecutionError('resource_busy')
    }
    const promise = Promise.resolve().then(create)
    const entry: TerminalCreateLedgerEntry = {
      connectionId: key.connectionId,
      instanceId: key.instanceId,
      shareEpoch: key.shareEpoch,
      spoolIncarnationId: key.spoolIncarnationId,
      fingerprint: key.fingerprint,
      promise,
      settled: false
    }
    this.entries.set(ledgerKey, entry)
    void promise.then(
      () => this.markSettled(ledgerKey, entry),
      (error) => this.rememberFailure(ledgerKey, entry, error)
    )
    return promise
  }

  closeConnection(connectionId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.connectionId === connectionId) {
        this.entries.delete(key)
      }
    }
  }

  private markSettled(key: string, entry: TerminalCreateLedgerEntry): void {
    if (this.entries.get(key) === entry) {
      entry.settled = true
    }
  }

  private rememberFailure(key: string, entry: TerminalCreateLedgerEntry, error: unknown): void {
    if (this.entries.get(key) !== entry) {
      return
    }
    if (error instanceof SpoolExecutionError && error.code === 'outcome_unknown') {
      // Why: the PTY may exist, so this rejected promise is still the only safe replay result.
      entry.settled = true
      return
    }
    this.entries.delete(key)
  }

  private inflightFor(key: TerminalCreateLedgerKey): number {
    let count = 0
    for (const entry of this.entries.values()) {
      if (!entry.settled && sameConnectionWorktree(entry, key)) {
        count++
      }
    }
    return count
  }

  private recordsFor(key: TerminalCreateLedgerKey): number {
    let count = 0
    for (const entry of this.entries.values()) {
      if (sameConnectionWorktree(entry, key)) {
        count++
      }
    }
    return count
  }
}

export function spoolTerminalCreateFingerprint(
  launch: SpoolTerminalCreateOperation['launch']
): string {
  return launch.kind === 'shell' ? 'shell' : `agent:${launch.agent}`
}

function createLedgerKey(key: TerminalCreateLedgerKey): string {
  return JSON.stringify([
    key.connectionId,
    key.instanceId,
    key.shareEpoch,
    key.spoolIncarnationId,
    key.clientMutationId
  ])
}

function sameConnectionWorktree(
  entry: TerminalCreateLedgerEntry,
  key: TerminalCreateLedgerKey
): boolean {
  return (
    entry.connectionId === key.connectionId &&
    entry.instanceId === key.instanceId &&
    entry.shareEpoch === key.shareEpoch &&
    entry.spoolIncarnationId === key.spoolIncarnationId
  )
}
