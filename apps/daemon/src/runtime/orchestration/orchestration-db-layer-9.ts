import { OrchestrationDbLayer8 } from './orchestration-db-layer-8'
import { OrchestrationError } from './orchestration-error'
import type { WorkerDispatchRow, FederatedDispatchRow, RemoteDispatchAttachmentRow } from './types'

export abstract class OrchestrationDbLayer9 extends OrchestrationDbLayer8 {
  reconcileFederatedWorkerStart(params: {
    dispatchId: string
    state: 'ready' | 'failed' | 'stopped' | 'start_unknown'
    stage: string
    lastError?: string | null
    worktreeId?: string | null
    terminalHandle?: string | null
    setupState?: string
    effects?: unknown[]
    residualResources?: unknown[]
  }): WorkerDispatchRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const dispatch = this.getDispatchContextById(params.dispatchId)
      const worker = this.getWorkerDispatch(params.dispatchId)
      if (!dispatch || !worker) {
        throw new OrchestrationError(
          'dispatch_not_found',
          `Federated Dispatch ${params.dispatchId} was not found.`
        )
      }
      if (!['starting', 'start_unknown'].includes(worker.state)) {
        this.db.exec('COMMIT')
        return worker
      }

      if (params.state === 'ready') {
        this.db
          .prepare(
            `UPDATE worker_dispatches
             SET state = 'ready', stage = ?, worktree_id = COALESCE(?, worktree_id),
                 agent_terminal_handle = COALESCE(?, agent_terminal_handle), setup_state = ?,
                 effects = ?, residual_resources = ?, last_error = NULL,
                 updated_at = datetime('now')
             WHERE dispatch_id = ? AND state IN ('starting', 'start_unknown')`
          )
          .run(
            params.stage,
            params.worktreeId ?? null,
            params.terminalHandle ?? null,
            params.setupState ?? worker.setup_state,
            JSON.stringify(params.effects ?? JSON.parse(worker.effects)),
            JSON.stringify(params.residualResources ?? JSON.parse(worker.residual_resources)),
            params.dispatchId
          )
        this.db
          .prepare(
            "UPDATE dispatch_contexts SET status = 'dispatched' WHERE id = ? AND status = 'pending'"
          )
          .run(params.dispatchId)
        this.db
          .prepare(
            "UPDATE tasks SET status = 'dispatched', completed_at = NULL WHERE id = ? AND status = 'blocked'"
          )
          .run(dispatch.task_id)
      } else if (params.state === 'start_unknown') {
        this.db
          .prepare(
            `UPDATE worker_dispatches
             SET stage = ?, last_error = ?, updated_at = datetime('now')
             WHERE dispatch_id = ? AND state IN ('starting', 'start_unknown')`
          )
          .run(params.stage, params.lastError ?? worker.last_error, params.dispatchId)
      } else {
        const reason = params.lastError ?? `The worker host reported ${params.state}.`
        this.db
          .prepare(
            `UPDATE worker_dispatches
             SET state = ?, stage = ?, last_error = ?, updated_at = datetime('now')
             WHERE dispatch_id = ? AND state IN ('starting', 'start_unknown')`
          )
          .run(params.state, params.stage, reason, params.dispatchId)
        this.db
          .prepare(
            `UPDATE dispatch_contexts
             SET status = 'failed', last_failure = ?, completed_at = datetime('now'),
                 capability_revoked_at = COALESCE(capability_revoked_at, datetime('now'))
             WHERE id = ? AND status IN ('pending', 'dispatched')`
          )
          .run(reason, params.dispatchId)
        this.db
          .prepare(
            "UPDATE tasks SET status = 'failed', completed_at = datetime('now') WHERE id = ? AND status IN ('blocked', 'dispatched')"
          )
          .run(dispatch.task_id)
        this.closeQuestionsForDispatch(params.dispatchId)
      }
      this.db.exec('COMMIT')
      return this.getWorkerDispatch(params.dispatchId) as WorkerDispatchRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getWorkerDispatch(dispatchId: string): WorkerDispatchRow | undefined {
    return this.db
      .prepare('SELECT * FROM worker_dispatches WHERE dispatch_id = ?')
      .get(dispatchId) as WorkerDispatchRow | undefined
  }

  getFederatedDispatch(dispatchId: string): FederatedDispatchRow | undefined {
    return this.db
      .prepare('SELECT * FROM federated_dispatches WHERE dispatch_id = ?')
      .get(dispatchId) as FederatedDispatchRow | undefined
  }

  listActiveFederatedDispatches(runId?: string): FederatedDispatchRow[] {
    return this.db
      .prepare(
        `SELECT fd.*
         FROM federated_dispatches fd
         INNER JOIN dispatch_contexts dc ON dc.id = fd.dispatch_id
         INNER JOIN worker_dispatches wd ON wd.dispatch_id = fd.dispatch_id
         WHERE wd.state IN ('starting', 'ready', 'stopping', 'start_unknown', 'stop_unknown')
           AND (? IS NULL OR dc.run_id = ?)
         ORDER BY fd.rowid`
      )
      .all(runId ?? null, runId ?? null) as FederatedDispatchRow[]
  }

  updateFederatedDispatchResources(params: {
    dispatchId: string
    remoteRuntimeEpoch: string
    worktreeId: string
    terminalHandle: string
  }): FederatedDispatchRow {
    this.db
      .prepare(
        `UPDATE federated_dispatches
         SET remote_runtime_epoch = ?, remote_worktree_id = ?, remote_terminal_handle = ?,
             updated_at = datetime('now')
         WHERE dispatch_id = ?`
      )
      .run(params.remoteRuntimeEpoch, params.worktreeId, params.terminalHandle, params.dispatchId)
    const row = this.getFederatedDispatch(params.dispatchId)
    if (!row) {
      throw new OrchestrationError(
        'dispatch_not_found',
        `Federated Dispatch ${params.dispatchId} was not found.`
      )
    }
    return row
  }

  createRemoteDispatchAttachment(params: {
    dispatchId: string
    taskId: string
    homePeerFingerprint: string
    protocolVersion: number
    runtimeEpoch: string
    mutationReceipt: {
      callerFingerprint: string
      requestId: string
      method: string
      payloadHash: string
    }
  }): RemoteDispatchAttachmentRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (params.homePeerFingerprint !== params.mutationReceipt.callerFingerprint) {
        throw new OrchestrationError(
          'resource_server_mismatch',
          'The authenticated Run-home peer does not match the attachment request.'
        )
      }
      const existingReceipt = this.getMutationReceipt(
        params.mutationReceipt.callerFingerprint,
        params.mutationReceipt.requestId
      )
      if (existingReceipt) {
        throw new OrchestrationError(
          existingReceipt.method === params.mutationReceipt.method &&
            existingReceipt.payload_hash === params.mutationReceipt.payloadHash
            ? 'operation_unknown'
            : 'request_mismatch',
          `Remote attachment request ${params.mutationReceipt.requestId} already exists.`
        )
      }
      this.db
        .prepare(
          `INSERT INTO mutation_receipts (
             caller_fingerprint, request_id, method, payload_hash, state, receipt
           ) VALUES (?, ?, ?, ?, 'pending', ?)`
        )
        .run(
          params.mutationReceipt.callerFingerprint,
          params.mutationReceipt.requestId,
          params.mutationReceipt.method,
          params.mutationReceipt.payloadHash,
          JSON.stringify({ accepted: { dispatchId: params.dispatchId } })
        )
      this.db
        .prepare(
          `INSERT INTO remote_dispatch_attachments (
             dispatch_id, task_id, home_peer_fingerprint, protocol_version, runtime_epoch
           ) VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          params.dispatchId,
          params.taskId,
          params.homePeerFingerprint,
          params.protocolVersion,
          params.runtimeEpoch
        )
      this.db.exec('COMMIT')
      return this.getRemoteDispatchAttachment(params.dispatchId) as RemoteDispatchAttachmentRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getRemoteDispatchAttachment(dispatchId: string): RemoteDispatchAttachmentRow | undefined {
    return this.db
      .prepare('SELECT * FROM remote_dispatch_attachments WHERE dispatch_id = ?')
      .get(dispatchId) as RemoteDispatchAttachmentRow | undefined
  }
}
