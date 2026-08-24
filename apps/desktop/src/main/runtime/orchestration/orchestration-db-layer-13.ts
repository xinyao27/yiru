import { OrchestrationDbLayer12 } from './orchestration-db-layer-12'
import { OrchestrationError } from './orchestration-error'
import type { DispatchContextRow, WorkerDispatchRow } from './types'

export abstract class OrchestrationDbLayer13 extends OrchestrationDbLayer12 {
  beginWorkerStop(
    dispatchId: string
  ):
    | { disposition: 'stopping'; worker: WorkerDispatchRow; dispatch: DispatchContextRow }
    | { disposition: 'already_settled'; worker: WorkerDispatchRow; dispatch: DispatchContextRow } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const dispatch = this.getDispatchContextById(dispatchId)
      const worker = this.getWorkerDispatch(dispatchId)
      if (!dispatch || !worker) {
        throw new OrchestrationError('dispatch_not_found', `Dispatch ${dispatchId} was not found.`)
      }
      if (['succeeded', 'failed', 'stopped', 'abandoned'].includes(worker.state)) {
        this.db.exec('COMMIT')
        return { disposition: 'already_settled', worker, dispatch }
      }
      if (!['ready', 'start_unknown'].includes(worker.state)) {
        throw new OrchestrationError(
          'dispatch_inactive',
          `Dispatch ${dispatchId} cannot stop from ${worker.state}.`
        )
      }
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET state = 'stopping', stage = 'stop_requested', updated_at = datetime('now')
           WHERE dispatch_id = ? AND state IN ('ready', 'start_unknown')`
        )
        .run(dispatchId)
      this.db
        .prepare(
          `UPDATE dispatch_contexts
           SET capability_revoked_at = COALESCE(capability_revoked_at, datetime('now'))
           WHERE id = ?`
        )
        .run(dispatchId)
      this.db.prepare("UPDATE tasks SET status = 'blocked' WHERE id = ?").run(dispatch.task_id)
      this.closeQuestionsForDispatch(dispatchId)
      this.db.exec('COMMIT')
      return {
        disposition: 'stopping',
        worker: this.getWorkerDispatch(dispatchId) as WorkerDispatchRow,
        dispatch: this.getDispatchContextById(dispatchId) as DispatchContextRow
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  settleWorkerStop(dispatchId: string): WorkerDispatchRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const worker = this.getWorkerDispatch(dispatchId)
      const dispatch = this.getDispatchContextById(dispatchId)
      if (!worker || !dispatch || worker.state !== 'stopping') {
        throw new OrchestrationError('dispatch_inactive', `Dispatch ${dispatchId} is not stopping.`)
      }
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET state = 'stopped', stage = 'process_stopped', updated_at = datetime('now')
           WHERE dispatch_id = ? AND state = 'stopping'`
        )
        .run(dispatchId)
      this.db
        .prepare(
          `UPDATE dispatch_contexts
           SET status = 'failed', completed_at = datetime('now'), last_failure = 'stopped'
           WHERE id = ? AND status IN ('pending', 'dispatched')`
        )
        .run(dispatchId)
      this.db.exec('COMMIT')
      return this.getWorkerDispatch(dispatchId) as WorkerDispatchRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  reconcileFederatedWorkerStop(dispatchId: string): WorkerDispatchRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const worker = this.getWorkerDispatch(dispatchId)
      const dispatch = this.getDispatchContextById(dispatchId)
      if (!worker || !dispatch || !this.getFederatedDispatch(dispatchId)) {
        throw new OrchestrationError(
          'dispatch_not_found',
          `Federated Dispatch ${dispatchId} was not found.`
        )
      }
      if (worker.state === 'stopped') {
        this.db.exec('COMMIT')
        return worker
      }
      if (!['stopping', 'stop_unknown'].includes(worker.state)) {
        throw new OrchestrationError(
          'dispatch_inactive',
          `Federated Dispatch ${dispatchId} cannot reconcile stop from ${worker.state}.`
        )
      }
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET state = 'stopped', stage = 'process_stopped', last_error = NULL,
               updated_at = datetime('now')
           WHERE dispatch_id = ? AND state IN ('stopping', 'stop_unknown')`
        )
        .run(dispatchId)
      this.db
        .prepare(
          `UPDATE dispatch_contexts
           SET status = 'failed', completed_at = COALESCE(completed_at, datetime('now')),
               last_failure = 'stopped'
           WHERE id = ? AND status IN ('pending', 'dispatched')`
        )
        .run(dispatchId)
      this.db.exec('COMMIT')
      return this.getWorkerDispatch(dispatchId) as WorkerDispatchRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  resumeFederatedWorkerForTerminalRelay(dispatchId: string): WorkerDispatchRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const worker = this.getWorkerDispatch(dispatchId)
      const dispatch = this.getDispatchContextById(dispatchId)
      if (!worker || !dispatch || worker.state !== 'stopping') {
        throw new OrchestrationError('dispatch_inactive', `Dispatch ${dispatchId} is not stopping.`)
      }
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET state = 'ready', stage = 'remote_report_pending', updated_at = datetime('now')
           WHERE dispatch_id = ? AND state = 'stopping'`
        )
        .run(dispatchId)
      this.db
        .prepare("UPDATE tasks SET status = 'dispatched' WHERE id = ? AND status = 'blocked'")
        .run(dispatch.task_id)
      this.db.exec('COMMIT')
      return this.getWorkerDispatch(dispatchId) as WorkerDispatchRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  markWorkerStopUnknown(dispatchId: string, reason: string): WorkerDispatchRow {
    this.db
      .prepare(
        `UPDATE worker_dispatches
         SET state = 'stop_unknown', stage = 'stop_outcome_unknown', last_error = ?,
             updated_at = datetime('now')
         WHERE dispatch_id = ? AND state = 'stopping'`
      )
      .run(reason, dispatchId)
    return this.getWorkerDispatch(dispatchId) as WorkerDispatchRow
  }

  abandonWorkerDispatch(dispatchId: string): {
    disposition: 'abandoned' | 'already_abandoned' | 'stale'
    worker: WorkerDispatchRow
  } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const worker = this.getWorkerDispatch(dispatchId)
      const dispatch = this.getDispatchContextById(dispatchId)
      if (!worker || !dispatch) {
        throw new OrchestrationError('dispatch_not_found', `Dispatch ${dispatchId} was not found.`)
      }
      if (worker.state === 'abandoned') {
        this.db.exec('COMMIT')
        return { disposition: 'already_abandoned', worker }
      }
      if (this.getDispatchContext(dispatch.task_id)?.id !== dispatchId) {
        this.db.exec('COMMIT')
        return { disposition: 'stale', worker }
      }
      if (worker.state === 'succeeded') {
        throw new OrchestrationError(
          'dispatch_inactive',
          `Dispatch ${dispatchId} already succeeded and cannot be abandoned.`
        )
      }
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET state = 'abandoned', stage = 'abandoned', updated_at = datetime('now')
           WHERE dispatch_id = ?`
        )
        .run(dispatchId)
      this.db
        .prepare(
          `UPDATE dispatch_contexts
           SET status = CASE WHEN status IN ('pending', 'dispatched') THEN 'failed' ELSE status END,
               capability_revoked_at = COALESCE(capability_revoked_at, datetime('now')),
               completed_at = COALESCE(completed_at, datetime('now'))
           WHERE id = ?`
        )
        .run(dispatchId)
      this.db.prepare("UPDATE tasks SET status = 'blocked' WHERE id = ?").run(dispatch.task_id)
      this.closeQuestionsForDispatch(dispatchId)
      this.db.exec('COMMIT')
      return {
        disposition: 'abandoned',
        worker: this.getWorkerDispatch(dispatchId) as WorkerDispatchRow
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
