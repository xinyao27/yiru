import { isEquivalentPaneKey, generateId, exposeRunTimestamps } from './orchestration-db-foundation'
import { OrchestrationDbLayer2 } from './orchestration-db-layer-2'
import { OrchestrationError } from './orchestration-error'
import type { RunRow, DeliveryRow, MutationReceiptRow } from './types'

export abstract class OrchestrationDbLayer3 extends OrchestrationDbLayer2 {
  protected hasColumn(table: string, column: string): boolean {
    const rows = this.db.pragma(`table_info(${table})`) as { name: string }[]
    return rows.some((r) => r.name === column)
  }

  protected createUndeliveredInboxIndexIfPossible(): void {
    if (!this.hasColumn('messages', 'delivered_at')) {
      return
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_undelivered_inbox
        ON messages(to_handle, read, delivered_at, sequence)
    `)
  }

  // Why: sqlite_master holds the table's CREATE SQL incl. the CHECK — cheapest reliable probe for whether it already allows 'heartbeat'.
  protected messagesTypeCheckAllowsHeartbeat(): boolean {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
      .get() as { sql: string } | undefined
    return !!row && row.sql.includes("'heartbeat'")
  }

  protected messagesTypeCheckAllowsQuestion(): boolean {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
      .get() as { sql: string } | undefined
    return !!row && row.sql.includes("'question'")
  }

  // ── Durable mutation receipts ──

  beginMutationReceipt(params: {
    callerFingerprint: string
    requestId: string
    method: string
    payloadHash: string
  }):
    | { disposition: 'started'; row: MutationReceiptRow }
    | { disposition: 'pending'; row: MutationReceiptRow }
    | { disposition: 'completed'; row: MutationReceiptRow } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const existing = this.getMutationReceipt(params.callerFingerprint, params.requestId)
      if (existing) {
        if (existing.method !== params.method || existing.payload_hash !== params.payloadHash) {
          throw new OrchestrationError(
            'request_mismatch',
            `Mutation request ${params.requestId} was already used with different input.`
          )
        }
        this.db.exec('COMMIT')
        return { disposition: existing.state, row: existing }
      }
      this.db
        .prepare(
          `INSERT INTO mutation_receipts (
             caller_fingerprint, request_id, method, payload_hash, state
           ) VALUES (?, ?, ?, ?, 'pending')`
        )
        .run(params.callerFingerprint, params.requestId, params.method, params.payloadHash)
      const row = this.getMutationReceipt(params.callerFingerprint, params.requestId)
      this.db.exec('COMMIT')
      return { disposition: 'started', row: row as MutationReceiptRow }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  completeMutationReceipt(params: {
    callerFingerprint: string
    requestId: string
    method: string
    payloadHash: string
    receipt: string
  }): MutationReceiptRow {
    const result = this.db
      .prepare(
        `UPDATE mutation_receipts
         SET state = 'completed', receipt = ?, updated_at = datetime('now')
         WHERE caller_fingerprint = ? AND request_id = ? AND method = ?
           AND payload_hash = ?`
      )
      .run(
        params.receipt,
        params.callerFingerprint,
        params.requestId,
        params.method,
        params.payloadHash
      )
    const row = this.getMutationReceipt(params.callerFingerprint, params.requestId)
    if (result.changes !== 1 || !row) {
      throw new OrchestrationError(
        'request_mismatch',
        `Mutation request ${params.requestId} no longer matches its pending operation.`
      )
    }
    return row
  }

  discardPendingMutationReceipt(callerFingerprint: string, requestId: string): void {
    this.db
      .prepare(
        `DELETE FROM mutation_receipts
         WHERE caller_fingerprint = ? AND request_id = ? AND state = 'pending'`
      )
      .run(callerFingerprint, requestId)
  }

  getMutationReceipt(callerFingerprint: string, requestId: string): MutationReceiptRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM mutation_receipts
         WHERE caller_fingerprint = ? AND request_id = ?`
      )
      .get(callerFingerprint, requestId) as MutationReceiptRow | undefined
  }

  // ── Runs ──

  createRun(params: {
    objective: string
    coordinatorHandle: string
    coordinatorPaneKey: string
  }): RunRow {
    const id = generateId('run')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.unbindOtherRunsForPane(params.coordinatorPaneKey)
      this.db
        .prepare(
          `INSERT INTO runs (
             id, objective, coordinator_handle, coordinator_pane_key,
             consumer_generation, legacy
           ) VALUES (?, ?, ?, ?, 1, 0)`
        )
        .run(id, params.objective, params.coordinatorHandle, params.coordinatorPaneKey)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.getRun(id) as RunRow
  }

  bindRun(params: {
    runId: string
    coordinatorHandle: string
    coordinatorPaneKey: string
  }): RunRow | undefined {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const run = this.getRunRaw(params.runId)
      if (!run || run.legacy === 1) {
        this.db.exec('ROLLBACK')
        return undefined
      }
      const sameBinding =
        run.coordinator_pane_key !== null &&
        isEquivalentPaneKey(run.coordinator_pane_key, params.coordinatorPaneKey)
      this.unbindOtherRunsForPane(params.coordinatorPaneKey, params.runId)
      if (!sameBinding || run.coordinator_handle !== params.coordinatorHandle) {
        this.db
          .prepare(
            `UPDATE runs
             SET coordinator_handle = ?, coordinator_pane_key = ?,
                 consumer_generation = consumer_generation + 1,
                 updated_at = datetime('now')
             WHERE id = ?`
          )
          .run(params.coordinatorHandle, params.coordinatorPaneKey, params.runId)
        this.fenceOutstandingDelivery(params.runId)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.getRun(params.runId)
  }

  getRun(id: string): RunRow | undefined {
    const run = this.getRunRaw(id)
    return run ? exposeRunTimestamps(run) : undefined
  }

  listRuns(): RunRow[] {
    return (this.db.prepare('SELECT * FROM runs ORDER BY created_at DESC').all() as RunRow[]).map(
      exposeRunTimestamps
    )
  }

  getCurrentRunForPane(paneKey: string): RunRow | undefined {
    const runs = this.db
      .prepare('SELECT * FROM runs WHERE coordinator_pane_key IS NOT NULL AND legacy = 0')
      .all() as RunRow[]
    const run = runs.find(
      (candidate) =>
        candidate.coordinator_pane_key !== null &&
        isEquivalentPaneKey(candidate.coordinator_pane_key, paneKey)
    )
    return run ? exposeRunTimestamps(run) : undefined
  }

  protected getRunRaw(id: string): RunRow | undefined {
    return this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined
  }

  protected unbindOtherRunsForPane(paneKey: string, exceptRunId?: string): void {
    const bound = this.db
      .prepare('SELECT * FROM runs WHERE coordinator_pane_key IS NOT NULL AND legacy = 0')
      .all() as RunRow[]
    for (const run of bound) {
      if (
        run.id !== exceptRunId &&
        run.coordinator_pane_key &&
        isEquivalentPaneKey(run.coordinator_pane_key, paneKey)
      ) {
        this.db
          .prepare(
            `UPDATE runs
             SET coordinator_handle = NULL, coordinator_pane_key = NULL,
                 consumer_generation = consumer_generation + 1,
                 updated_at = datetime('now')
             WHERE id = ?`
          )
          .run(run.id)
        this.fenceOutstandingDelivery(run.id)
      }
    }
  }

  protected requireRun(runId: string): void {
    if (!this.getRunRaw(runId)) {
      throw new Error(`Run not found: ${runId}`)
    }
  }

  protected fenceOutstandingDelivery(runId: string): void {
    this.db
      .prepare(
        "UPDATE deliveries SET status = 'fenced' WHERE run_id = ? AND status = 'outstanding'"
      )
      .run(runId)
  }

  protected requireCurrentConsumer(runId: string, consumerGeneration: number): RunRow {
    const run = this.getRunRaw(runId)
    if (!run || run.legacy === 1 || run.consumer_generation !== consumerGeneration) {
      throw new OrchestrationError(
        'consumer_fenced',
        'This mailbox consumer has been replaced. Rebind with orchestration run-use.'
      )
    }
    return run
  }

  protected getDeliveryRaw(id: string): DeliveryRow | undefined {
    return this.db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id) as
      | DeliveryRow
      | undefined
  }
}
