import { generateId, LEGACY_RUN_ID } from './orchestration-db-foundation'
import { OrchestrationDbLayer14 } from './orchestration-db-layer-14'
import type {
  TaskStatus,
  DispatchStatus,
  GateStatus,
  DispatchContextRow,
  DecisionGateRow,
  CoordinatorRun,
  WorkerReportOutcome,
  WorkerReportSettlement
} from './types'

export abstract class OrchestrationDbLayer15 extends OrchestrationDbLayer14 {
  protected settleWorkerReportInTransaction(params: {
    taskId: string
    dispatchId: string
    outcome: WorkerReportOutcome
    result: string
  }): WorkerReportSettlement {
    const task = this.getTask(params.taskId)
    if (!task) {
      return { action: 'rejected', code: 'unknown_task', reason: `Unknown task ${params.taskId}.` }
    }
    const dispatch = this.getDispatchContextById(params.dispatchId)
    if (!dispatch) {
      return {
        action: 'rejected',
        code: 'unknown_dispatch',
        reason: `Unknown dispatch ${params.dispatchId}.`
      }
    }
    if (dispatch.task_id !== params.taskId) {
      return {
        action: 'rejected',
        code: 'task_dispatch_mismatch',
        reason: `Dispatch ${params.dispatchId} belongs to task ${dispatch.task_id}, not ${params.taskId}.`
      }
    }

    const expectedDispatchStatus = params.outcome === 'succeeded' ? 'completed' : 'failed'
    const expectedTaskStatus = params.outcome === 'succeeded' ? 'completed' : 'failed'
    if (dispatch.status === expectedDispatchStatus && task.status === expectedTaskStatus) {
      return { action: 'settled', outcome: params.outcome, duplicate: true }
    }
    if (dispatch.status !== 'dispatched' || task.status !== 'dispatched') {
      return {
        action: 'rejected',
        code: 'inactive_dispatch',
        reason: `inactive dispatch ${params.dispatchId}: it or task ${params.taskId} is already settled.`
      }
    }
    const latest = this.getDispatchContext(params.taskId)
    if (latest?.id !== params.dispatchId) {
      return {
        action: 'rejected',
        code: 'stale_dispatch',
        reason: `Dispatch ${params.dispatchId} is not the current dispatch for task ${params.taskId}.`
      }
    }

    this.db.exec('SAVEPOINT settle_worker_report')
    const dispatchUpdate = this.db
      .prepare(
        `UPDATE dispatch_contexts
         SET status = ?, completed_at = datetime('now'),
             last_failure = CASE WHEN ? = 'failed' THEN ? ELSE last_failure END,
             capability_revoked_at = COALESCE(capability_revoked_at, datetime('now'))
         WHERE id = ? AND status = 'dispatched'`
      )
      .run(expectedDispatchStatus, expectedDispatchStatus, params.result, params.dispatchId)
    const taskUpdate = this.db
      .prepare(
        `UPDATE tasks
         SET status = ?, result = ?, completed_at = datetime('now')
         WHERE id = ? AND status = 'dispatched'`
      )
      .run(expectedTaskStatus, params.result, params.taskId)
    if (dispatchUpdate.changes !== 1 || taskUpdate.changes !== 1) {
      this.db.exec('ROLLBACK TO settle_worker_report')
      this.db.exec('RELEASE settle_worker_report')
      return {
        action: 'rejected',
        code: 'inactive_dispatch',
        reason: `Dispatch ${params.dispatchId} changed while its worker report was settling.`
      }
    }
    this.db
      .prepare(
        `UPDATE worker_dispatches
         SET state = ?, stage = 'settled', updated_at = datetime('now')
         WHERE dispatch_id = ? AND state = 'ready'`
      )
      .run(params.outcome === 'succeeded' ? 'succeeded' : 'failed', params.dispatchId)
    this.closeQuestionsForDispatch(params.dispatchId)
    if (params.outcome === 'succeeded') {
      this.promoteReadyTasks(params.taskId)
    }
    this.db.exec('RELEASE settle_worker_report')
    return { action: 'settled', outcome: params.outcome, duplicate: false }
  }

  failActiveDispatchForTask(taskId: string, error: string): DispatchContextRow | undefined {
    const active = this.db
      .prepare(
        "SELECT * FROM dispatch_contexts WHERE task_id = ? AND status IN ('pending', 'dispatched') ORDER BY rowid DESC LIMIT 1"
      )
      .get(taskId) as DispatchContextRow | undefined
    return active ? this.failDispatch(active.id, error) : undefined
  }

  // Why: only bump status='dispatched' — a zombie heartbeat from a finished dispatch would mask a hung retry from the stale detector (§5.3.4).
  recordHeartbeat(dispatchId: string, at: string): void {
    this.db
      .prepare(
        "UPDATE dispatch_contexts SET last_heartbeat_at = ? WHERE id = ? AND status = 'dispatched'"
      )
      .run(at, dispatchId)
  }

  // Why: dispatched_at grace skips workers still within their first heartbeat interval; julianday() vs raw-TEXT compare avoids misflagging space-format timestamps as stale (#8452).
  getStaleDispatches(thresholdIso: string): DispatchContextRow[] {
    return this.db
      .prepare(
        `SELECT * FROM dispatch_contexts
         WHERE status = 'dispatched'
           AND dispatched_at IS NOT NULL
           AND julianday(dispatched_at) < julianday(?)
           AND (last_heartbeat_at IS NULL OR julianday(last_heartbeat_at) < julianday(?))`
      )
      .all(thresholdIso, thresholdIso) as DispatchContextRow[]
  }

  failDispatch(ctxId: string, error: string): DispatchContextRow | undefined {
    const ctx = this.db.prepare('SELECT * FROM dispatch_contexts WHERE id = ?').get(ctxId) as
      | DispatchContextRow
      | undefined
    if (!ctx) {
      return undefined
    }

    const newFailureCount = ctx.failure_count + 1
    const newStatus: DispatchStatus = newFailureCount >= 3 ? 'circuit_broken' : 'failed'

    this.db
      .prepare(
        `UPDATE dispatch_contexts
         SET status = ?, failure_count = ?, last_failure = ?,
             capability_revoked_at = COALESCE(capability_revoked_at, datetime('now'))
         WHERE id = ?`
      )
      .run(newStatus, newFailureCount, error, ctxId)

    // Why: back to 'ready' not 'pending' — 'pending' would strand it since promoteReadyTasks only runs when a dep completes.
    const taskStatus: TaskStatus = newStatus === 'circuit_broken' ? 'failed' : 'ready'
    this.db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(taskStatus, ctx.task_id)

    return this.db.prepare('SELECT * FROM dispatch_contexts WHERE id = ?').get(ctxId) as
      | DispatchContextRow
      | undefined
  }

  // ── Decision Gates ──

  createGate(gate: { taskId: string; question: string; options?: string[] }): DecisionGateRow {
    const id = generateId('gate')
    const optionsJson = JSON.stringify(gate.options ?? [])
    this.db
      .prepare(
        'INSERT INTO decision_gates (id, run_id, task_id, question, options) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        id,
        this.getTask(gate.taskId)?.run_id ?? LEGACY_RUN_ID,
        gate.taskId,
        gate.question,
        optionsJson
      )

    this.completeActiveDispatchForTask(gate.taskId)
    this.db.prepare("UPDATE tasks SET status = 'blocked' WHERE id = ?").run(gate.taskId)

    return this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(id) as DecisionGateRow
  }

  resolveGate(gateId: string, resolution: string): DecisionGateRow | undefined {
    const gate = this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(gateId) as
      | DecisionGateRow
      | undefined
    if (!gate) {
      return undefined
    }

    this.db
      .prepare(
        "UPDATE decision_gates SET status = 'resolved', resolution = ?, resolved_at = datetime('now') WHERE id = ?"
      )
      .run(resolution, gateId)

    // Why: set to 'ready' (not the previous status) so the coordinator re-dispatches the worker with the resolution context.
    this.db.prepare("UPDATE tasks SET status = 'ready' WHERE id = ?").run(gate.task_id)

    return this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(gateId) as
      | DecisionGateRow
      | undefined
  }

  timeoutGate(gateId: string): DecisionGateRow | undefined {
    this.db
      .prepare(
        "UPDATE decision_gates SET status = 'timeout', resolved_at = datetime('now') WHERE id = ?"
      )
      .run(gateId)
    return this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(gateId) as
      | DecisionGateRow
      | undefined
  }

  listGates(filter?: { taskId?: string; status?: GateStatus }): DecisionGateRow[] {
    if (filter?.taskId && filter?.status) {
      return this.db
        .prepare(
          'SELECT * FROM decision_gates WHERE task_id = ? AND status = ? ORDER BY created_at'
        )
        .all(filter.taskId, filter.status) as DecisionGateRow[]
    }
    if (filter?.taskId) {
      return this.db
        .prepare('SELECT * FROM decision_gates WHERE task_id = ? ORDER BY created_at')
        .all(filter.taskId) as DecisionGateRow[]
    }
    if (filter?.status) {
      return this.db
        .prepare('SELECT * FROM decision_gates WHERE status = ? ORDER BY created_at')
        .all(filter.status) as DecisionGateRow[]
    }
    return this.db
      .prepare('SELECT * FROM decision_gates ORDER BY created_at')
      .all() as DecisionGateRow[]
  }

  getGate(id: string): DecisionGateRow | undefined {
    return this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(id) as
      | DecisionGateRow
      | undefined
  }

  // ── Coordinator Runs ──

  createCoordinatorRun(run: {
    spec: string
    coordinatorHandle: string
    pollIntervalMs?: number
  }): CoordinatorRun {
    const id = generateId('run')
    this.db
      .prepare(
        "INSERT INTO coordinator_runs (id, spec, status, coordinator_handle, poll_interval_ms) VALUES (?, ?, 'running', ?, ?)"
      )
      .run(id, run.spec, run.coordinatorHandle, run.pollIntervalMs ?? 2000)
    return this.db.prepare('SELECT * FROM coordinator_runs WHERE id = ?').get(id) as CoordinatorRun
  }

  getCoordinatorRun(id: string): CoordinatorRun | undefined {
    return this.db.prepare('SELECT * FROM coordinator_runs WHERE id = ?').get(id) as
      | CoordinatorRun
      | undefined
  }
}
