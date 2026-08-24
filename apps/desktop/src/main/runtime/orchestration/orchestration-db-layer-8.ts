import { randomBytes } from 'node:crypto'

import { hashDispatchCapability } from './orchestration-db-foundation'
import { OrchestrationDbLayer7 } from './orchestration-db-layer-7'
import { OrchestrationError } from './orchestration-error'
import type { WorkerDispatchRow } from './types'

export abstract class OrchestrationDbLayer8 extends OrchestrationDbLayer7 {
  prepareStartingWorkerAuthority(params: {
    dispatchId: string
    handle: string
    paneKey: string
    processIncarnation: string
    worktreeId: string
    effects: unknown[]
    setupState: string
  }): string {
    const dispatch = this.getDispatchContextById(params.dispatchId)
    const worker = this.getWorkerDispatch(params.dispatchId)
    if (!dispatch || dispatch.status !== 'pending' || worker?.state !== 'starting') {
      throw new OrchestrationError(
        'dispatch_inactive',
        `Dispatch ${params.dispatchId} is not starting.`
      )
    }
    const capability = `dcap_${randomBytes(32).toString('base64url')}`
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare(
          `UPDATE dispatch_contexts
           SET assignee_handle = ?, assignee_pane_key = ?, process_incarnation = ?,
               capability_hash = ?, capability_revoked_at = NULL
           WHERE id = ? AND status = 'pending'`
        )
        .run(
          params.handle,
          params.paneKey,
          params.processIncarnation,
          hashDispatchCapability(capability),
          params.dispatchId
        )
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET stage = 'authority_attached', worktree_id = ?, agent_terminal_handle = ?,
               setup_state = ?, effects = ?, residual_resources = ?, updated_at = datetime('now')
           WHERE dispatch_id = ? AND state = 'starting'`
        )
        .run(
          params.worktreeId,
          params.handle,
          params.setupState,
          JSON.stringify(params.effects),
          JSON.stringify(
            params.effects.filter((effect) =>
              Boolean(
                effect &&
                typeof effect === 'object' &&
                ((effect as { action?: string }).action?.startsWith('created') ||
                  (effect as { action?: string }).action === 'reused_agent_terminal')
              )
            )
          ),
          params.dispatchId
        )
      this.db.exec('COMMIT')
      return capability
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  markWorkerDispatchReady(dispatchId: string, effects?: unknown[]): WorkerDispatchRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const dispatch = this.getDispatchContextById(dispatchId)
      const worker = this.getWorkerDispatch(dispatchId)
      if (!dispatch || dispatch.status !== 'pending' || worker?.state !== 'starting') {
        throw new OrchestrationError('dispatch_inactive', `Dispatch ${dispatchId} is not starting.`)
      }
      this.db
        .prepare("UPDATE dispatch_contexts SET status = 'dispatched' WHERE id = ?")
        .run(dispatchId)
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET state = 'ready', stage = 'input_accepted',
               effects = COALESCE(?, effects), updated_at = datetime('now')
           WHERE dispatch_id = ?`
        )
        .run(effects ? JSON.stringify(effects) : null, dispatchId)
      this.db.exec('COMMIT')
      return this.getWorkerDispatch(dispatchId) as WorkerDispatchRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  failWorkerStart(dispatchId: string, stage: string, reason: string): WorkerDispatchRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const dispatch = this.getDispatchContextById(dispatchId)
      const worker = this.getWorkerDispatch(dispatchId)
      if (!dispatch || !worker || worker.state !== 'starting') {
        throw new OrchestrationError('dispatch_inactive', `Dispatch ${dispatchId} is not starting.`)
      }
      this.db
        .prepare(
          `UPDATE dispatch_contexts
           SET status = 'failed', last_failure = ?, completed_at = datetime('now'),
               capability_revoked_at = COALESCE(capability_revoked_at, datetime('now'))
           WHERE id = ?`
        )
        .run(reason, dispatchId)
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET state = 'failed', stage = ?, last_error = ?, updated_at = datetime('now')
           WHERE dispatch_id = ?`
        )
        .run(stage, reason, dispatchId)
      this.db
        .prepare("UPDATE tasks SET status = 'failed', completed_at = datetime('now') WHERE id = ?")
        .run(dispatch.task_id)
      this.closeQuestionsForDispatch(dispatchId)
      this.db.exec('COMMIT')
      return this.getWorkerDispatch(dispatchId) as WorkerDispatchRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  markWorkerStartUnknown(dispatchId: string, stage: string, reason: string): WorkerDispatchRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const dispatch = this.getDispatchContextById(dispatchId)
      const worker = this.getWorkerDispatch(dispatchId)
      if (!dispatch || !worker || worker.state !== 'starting') {
        throw new OrchestrationError('dispatch_inactive', `Dispatch ${dispatchId} is not starting.`)
      }
      this.db
        .prepare(
          `UPDATE worker_dispatches
           SET state = 'start_unknown', stage = ?, last_error = ?, updated_at = datetime('now')
           WHERE dispatch_id = ?`
        )
        .run(stage, reason, dispatchId)
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
      return this.getWorkerDispatch(dispatchId) as WorkerDispatchRow
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
