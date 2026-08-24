import { isEquivalentPaneKey, generateId } from './orchestration-db-foundation'
import { OrchestrationDbLayer10 } from './orchestration-db-layer-10'
import { OrchestrationError } from './orchestration-error'
import type {
  WorkerReportOutcome,
  RemoteDispatchAttachmentRow,
  FederationRelayDirection,
  FederationRelayItemRow
} from './types'

export abstract class OrchestrationDbLayer11 extends OrchestrationDbLayer10 {
  findActiveRemoteAttachmentForPane(paneKey: string): RemoteDispatchAttachmentRow | undefined {
    const rows = this.db
      .prepare(
        `SELECT * FROM remote_dispatch_attachments
         WHERE state IN ('starting', 'ready') AND pane_key IS NOT NULL
         ORDER BY rowid DESC`
      )
      .all() as RemoteDispatchAttachmentRow[]
    return rows.find((row) => row.pane_key && isEquivalentPaneKey(row.pane_key, paneKey))
  }

  enqueueFederationRelay(params: {
    dispatchId: string
    direction: FederationRelayDirection
    kind: string
    payload: string
    messageId?: string
    settleRemoteOutcome?: WorkerReportOutcome
    remoteQuestion?: true
  }): FederationRelayItemRow {
    const byteCount = Buffer.byteLength(params.payload, 'utf8')
    const messageId = params.messageId ?? generateId('relay')
    if (byteCount > 64 * 1024) {
      throw new OrchestrationError(
        'relay_quota_exceeded',
        'A federated orchestration message cannot exceed 64 KiB.'
      )
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (params.settleRemoteOutcome) {
        const attachment = this.getRemoteDispatchAttachment(params.dispatchId)
        if (!attachment || attachment.state !== 'ready') {
          throw new OrchestrationError(
            'dispatch_inactive',
            `Remote Dispatch ${params.dispatchId} is not active.`
          )
        }
      }
      if (params.kind === 'heartbeat') {
        const heartbeat = this.db
          .prepare(
            `SELECT * FROM federation_relay_items
             WHERE dispatch_id = ? AND direction = ? AND kind = 'heartbeat'
               AND acked_at IS NULL
             ORDER BY sequence DESC LIMIT 1`
          )
          .get(params.dispatchId, params.direction) as FederationRelayItemRow | undefined
        if (heartbeat) {
          this.db
            .prepare(
              `UPDATE federation_relay_items
               SET payload = ?, byte_count = ?, created_at = datetime('now')
               WHERE dispatch_id = ? AND direction = ? AND sequence = ?`
            )
            .run(params.payload, byteCount, params.dispatchId, params.direction, heartbeat.sequence)
          this.db.exec('COMMIT')
          return this.getFederationRelayItem(
            params.dispatchId,
            params.direction,
            heartbeat.sequence
          ) as FederationRelayItemRow
        }
      }
      const quota = this.db
        .prepare(
          `SELECT COUNT(*) AS count, COALESCE(SUM(byte_count), 0) AS bytes
           FROM federation_relay_items
           WHERE dispatch_id = ? AND direction = ? AND acked_at IS NULL`
        )
        .get(params.dispatchId, params.direction) as { count: number; bytes: number }
      if (quota.count >= 256 || quota.bytes + byteCount > 1024 * 1024) {
        if (params.kind === 'worker_done') {
          const heartbeat = this.db
            .prepare(
              `SELECT * FROM federation_relay_items
               WHERE dispatch_id = ? AND direction = ? AND kind = 'heartbeat'
                 AND acked_at IS NULL
               ORDER BY sequence LIMIT 1`
            )
            .get(params.dispatchId, params.direction) as FederationRelayItemRow | undefined
          if (heartbeat) {
            this.db
              .prepare(
                `UPDATE federation_relay_items
                 SET message_id = ?, kind = ?, payload = ?, byte_count = ?,
                     created_at = datetime('now')
                 WHERE dispatch_id = ? AND direction = ? AND sequence = ?`
              )
              .run(
                messageId,
                params.kind,
                params.payload,
                byteCount,
                params.dispatchId,
                params.direction,
                heartbeat.sequence
              )
            this.settleRemoteAttachmentInRelayTransaction(
              params.dispatchId,
              params.settleRemoteOutcome
            )
            this.db.exec('COMMIT')
            return this.getFederationRelayItem(
              params.dispatchId,
              params.direction,
              heartbeat.sequence
            ) as FederationRelayItemRow
          }
        }
        throw new OrchestrationError(
          'relay_quota_exceeded',
          `Federated Dispatch ${params.dispatchId} has no relay capacity.`
        )
      }
      const latest = this.db
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) AS sequence
           FROM federation_relay_items WHERE dispatch_id = ? AND direction = ?`
        )
        .get(params.dispatchId, params.direction) as { sequence: number }
      const sequence = latest.sequence + 1
      this.db
        .prepare(
          `INSERT INTO federation_relay_items (
             dispatch_id, direction, sequence, message_id, kind, payload, byte_count
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          params.dispatchId,
          params.direction,
          sequence,
          messageId,
          params.kind,
          params.payload,
          byteCount
        )
      if (params.remoteQuestion) {
        this.db
          .prepare(
            `INSERT INTO remote_questions (message_id, dispatch_id)
             VALUES (?, ?)`
          )
          .run(messageId, params.dispatchId)
      }
      this.settleRemoteAttachmentInRelayTransaction(params.dispatchId, params.settleRemoteOutcome)
      this.db.exec('COMMIT')
      return this.getFederationRelayItem(
        params.dispatchId,
        params.direction,
        sequence
      ) as FederationRelayItemRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listFederationRelay(params: {
    dispatchId: string
    direction: FederationRelayDirection
    afterSequence: number
    limit?: number
  }): FederationRelayItemRow[] {
    return this.db
      .prepare(
        `SELECT * FROM federation_relay_items
         WHERE dispatch_id = ? AND direction = ? AND sequence > ?
         ORDER BY sequence LIMIT ?`
      )
      .all(
        params.dispatchId,
        params.direction,
        params.afterSequence,
        Math.min(Math.max(params.limit ?? 50, 1), 50)
      ) as FederationRelayItemRow[]
  }

  listPendingFederationRelay(
    dispatchId: string,
    direction: FederationRelayDirection,
    limit = 50
  ): FederationRelayItemRow[] {
    return this.db
      .prepare(
        `SELECT * FROM federation_relay_items
         WHERE dispatch_id = ? AND direction = ? AND acked_at IS NULL
         ORDER BY sequence LIMIT ?`
      )
      .all(dispatchId, direction, Math.min(Math.max(limit, 1), 50)) as FederationRelayItemRow[]
  }

  acknowledgeFederationRelay(params: {
    dispatchId: string
    direction: FederationRelayDirection
    throughSequence: number
  }): void {
    this.db
      .prepare(
        `UPDATE federation_relay_items SET acked_at = COALESCE(acked_at, datetime('now'))
         WHERE dispatch_id = ? AND direction = ? AND sequence <= ?`
      )
      .run(params.dispatchId, params.direction, params.throughSequence)
  }

  setFederatedHomeImportSequence(dispatchId: string, sequence: number): void {
    this.db
      .prepare(
        `UPDATE federated_dispatches
         SET to_home_imported_sequence = ?, updated_at = datetime('now')
         WHERE dispatch_id = ? AND to_home_imported_sequence < ?`
      )
      .run(sequence, dispatchId, sequence)
  }
}
