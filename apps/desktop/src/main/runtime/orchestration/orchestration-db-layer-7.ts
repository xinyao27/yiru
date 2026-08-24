import { generateId } from './orchestration-db-foundation'
import { OrchestrationDbLayer6 } from './orchestration-db-layer-6'
import { OrchestrationError } from './orchestration-error'
import type { DispatchContextRow, WorkerDispatchRow, WorkerDispatchState } from './types'

export abstract class OrchestrationDbLayer7 extends OrchestrationDbLayer6 {
  // ── Dispatch Contexts ──

  createStartingWorkerDispatch(params: {
    taskId: string
    startOptions: unknown
    retryOf?: string
    runtimeEpoch?: string
    federation?: {
      environmentId: string
      environmentName: string
      peerFingerprint: string
      protocolVersion: number
    }
    mutationReceipt?: {
      callerFingerprint: string
      requestId: string
      method: string
      payloadHash: string
    }
  }): { dispatch: DispatchContextRow; worker: WorkerDispatchRow } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (params.mutationReceipt) {
        const receipt = params.mutationReceipt
        const existing = this.getMutationReceipt(receipt.callerFingerprint, receipt.requestId)
        if (existing) {
          if (existing.method !== receipt.method || existing.payload_hash !== receipt.payloadHash) {
            throw new OrchestrationError(
              'request_mismatch',
              `Mutation request ${receipt.requestId} was already used with different input.`
            )
          }
          throw new OrchestrationError(
            'operation_unknown',
            `Mutation ${receipt.requestId} already has a durable acceptance record.`
          )
        }
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               caller_fingerprint, request_id, method, payload_hash, state
             ) VALUES (?, ?, ?, ?, 'pending')`
          )
          .run(receipt.callerFingerprint, receipt.requestId, receipt.method, receipt.payloadHash)
      }
      const task = this.getTask(params.taskId)
      if (!task) {
        throw new OrchestrationError('task_not_found', `Task ${params.taskId} was not found.`)
      }
      if (params.retryOf) {
        const prior = this.getDispatchContextById(params.retryOf)
        const priorWorker = this.getWorkerDispatch(params.retryOf)
        const latest = this.getDispatchContext(task.id)
        if (
          !prior ||
          prior.task_id !== task.id ||
          latest?.id !== prior.id ||
          !priorWorker ||
          !['failed', 'stopped', 'abandoned'].includes(priorWorker.state) ||
          !['failed', 'blocked'].includes(task.status)
        ) {
          throw new OrchestrationError(
            'task_not_startable',
            `Task ${task.id} cannot retry from Dispatch ${params.retryOf}.`
          )
        }
      } else if (task.status !== 'ready') {
        throw new OrchestrationError(
          'task_not_startable',
          `Task ${task.id} is ${task.status}; only a ready Task can start.`
        )
      }

      const id = generateId('ctx')
      if (params.mutationReceipt) {
        this.db
          .prepare(
            `UPDATE mutation_receipts
             SET receipt = ?, updated_at = datetime('now')
             WHERE caller_fingerprint = ? AND request_id = ? AND state = 'pending'`
          )
          .run(
            JSON.stringify({ accepted: { dispatchId: id } }),
            params.mutationReceipt.callerFingerprint,
            params.mutationReceipt.requestId
          )
      }
      this.db
        .prepare(
          `INSERT INTO dispatch_contexts (
             id, run_id, task_id, status, dispatched_at
           ) VALUES (?, ?, ?, 'pending', datetime('now'))`
        )
        .run(id, task.run_id, task.id)
      this.db
        .prepare(
          `INSERT INTO worker_dispatches (
             dispatch_id, runtime_epoch, state, stage, start_options
           ) VALUES (?, ?, 'starting', 'accepted', ?)`
        )
        .run(id, params.runtimeEpoch ?? null, JSON.stringify(params.startOptions))
      if (params.federation) {
        this.db
          .prepare(
            `INSERT INTO federated_dispatches (
               dispatch_id, environment_id, environment_name, peer_fingerprint, protocol_version
             ) VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            id,
            params.federation.environmentId,
            params.federation.environmentName,
            params.federation.peerFingerprint,
            params.federation.protocolVersion
          )
      }
      this.db
        .prepare(
          "UPDATE tasks SET status = 'dispatched', result = NULL, completed_at = NULL WHERE id = ?"
        )
        .run(task.id)
      this.db.exec('COMMIT')
      return {
        dispatch: this.getDispatchContextById(id) as DispatchContextRow,
        worker: this.getWorkerDispatch(id) as WorkerDispatchRow
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  recordWorkerStage(params: {
    dispatchId: string
    stage: string
    worktreeId?: string
    terminalHandle?: string
    setupState?: string
    effects?: unknown[]
    residualResources?: unknown[]
    lastError?: string
    state?: WorkerDispatchState
  }): WorkerDispatchRow {
    const current = this.getWorkerDispatch(params.dispatchId)
    if (!current) {
      throw new OrchestrationError(
        'dispatch_not_found',
        `Dispatch ${params.dispatchId} was not found.`
      )
    }
    this.db
      .prepare(
        `UPDATE worker_dispatches
         SET stage = ?, state = ?, worktree_id = ?, agent_terminal_handle = ?,
             setup_state = ?, effects = ?, residual_resources = ?, last_error = ?,
             updated_at = datetime('now')
         WHERE dispatch_id = ?`
      )
      .run(
        params.stage,
        params.state ?? current.state,
        params.worktreeId ?? current.worktree_id,
        params.terminalHandle ?? current.agent_terminal_handle,
        params.setupState ?? current.setup_state,
        params.effects ? JSON.stringify(params.effects) : current.effects,
        params.residualResources
          ? JSON.stringify(params.residualResources)
          : current.residual_resources,
        params.lastError ?? current.last_error,
        params.dispatchId
      )
    return this.getWorkerDispatch(params.dispatchId) as WorkerDispatchRow
  }

  updateWorkerSetupEvidence(params: {
    dispatchId: string
    setupState: string
    effects: unknown[]
  }): { worker: WorkerDispatchRow; changed: boolean } {
    const current = this.getWorkerDispatch(params.dispatchId)
    if (!current) {
      throw new OrchestrationError(
        'dispatch_not_found',
        `Dispatch ${params.dispatchId} was not found.`
      )
    }
    const effects = JSON.stringify(params.effects)
    if (current.setup_state === params.setupState && current.effects === effects) {
      return { worker: current, changed: false }
    }
    this.db
      .prepare(
        `UPDATE worker_dispatches
         SET setup_state = ?, effects = ?, updated_at = datetime('now')
         WHERE dispatch_id = ?`
      )
      .run(params.setupState, effects, params.dispatchId)
    return {
      worker: this.getWorkerDispatch(params.dispatchId) as WorkerDispatchRow,
      changed: true
    }
  }
}
