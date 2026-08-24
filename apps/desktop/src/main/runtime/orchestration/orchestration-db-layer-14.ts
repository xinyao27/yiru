import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
  isEquivalentPaneKey,
  generateId,
  hashDispatchCapability
} from './orchestration-db-foundation'
import { OrchestrationDbLayer13 } from './orchestration-db-layer-13'
import { OrchestrationError } from './orchestration-error'
import type { DispatchContextRow, WorkerReportOutcome, WorkerReportSettlement } from './types'

export abstract class OrchestrationDbLayer14 extends OrchestrationDbLayer13 {
  createDispatchContext(
    taskId: string,
    assigneeHandle: string,
    // Why: pane key is the remint-stable identity behind the handle — lets worker_done ownership survive handle reissue.
    assigneePaneKey?: string
  ): DispatchContextRow {
    const task = this.getTask(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }
    if (task.status !== 'ready') {
      throw new Error(`Task ${taskId} is ${task.status}; only ready tasks can be dispatched`)
    }

    // Why: lock on pane identity too, so a reminted handle can't open a second concurrent dispatch on the same pane.
    const existing = this.findActiveDispatchForAssignee(assigneeHandle, assigneePaneKey)

    if (existing) {
      throw new Error(
        `Terminal ${assigneeHandle} already has an active dispatch (${existing.id} for task ${existing.task_id})`
      )
    }

    // Carry forward failure_count so the circuit breaker accumulates across retries for the same task.
    const prior = this.db
      .prepare('SELECT MAX(failure_count) as max_failures FROM dispatch_contexts WHERE task_id = ?')
      .get(taskId) as { max_failures: number | null } | undefined
    const priorFailures = prior?.max_failures ?? 0

    const id = generateId('ctx')
    this.db
      .prepare(
        `INSERT INTO dispatch_contexts (id, run_id, task_id, assignee_handle, assignee_pane_key, status, failure_count, dispatched_at)
         VALUES (?, ?, ?, ?, ?, 'dispatched', ?, datetime('now'))`
      )
      .run(id, task.run_id, taskId, assigneeHandle, assigneePaneKey ?? null, priorFailures)
    this.hasAnyDispatchContextsCache = true

    this.db.prepare("UPDATE tasks SET status = 'dispatched' WHERE id = ?").run(taskId)

    return this.db
      .prepare('SELECT * FROM dispatch_contexts WHERE id = ?')
      .get(id) as DispatchContextRow
  }

  getDispatchContext(taskId: string): DispatchContextRow | undefined {
    return this.db
      .prepare('SELECT * FROM dispatch_contexts WHERE task_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(taskId) as DispatchContextRow | undefined
  }

  getDispatchContextById(dispatchId: string): DispatchContextRow | undefined {
    return this.db.prepare('SELECT * FROM dispatch_contexts WHERE id = ?').get(dispatchId) as
      | DispatchContextRow
      | undefined
  }

  mintDispatchCapability(params: {
    dispatchId: string
    paneKey: string
    processIncarnation: string
  }): string {
    const dispatch = this.getDispatchContextById(params.dispatchId)
    if (!dispatch || (dispatch.status !== 'pending' && dispatch.status !== 'dispatched')) {
      throw new OrchestrationError(
        'dispatch_inactive',
        `Dispatch ${params.dispatchId} is not active.`
      )
    }
    const capability = `dcap_${randomBytes(32).toString('base64url')}`
    this.db
      .prepare(
        `UPDATE dispatch_contexts
         SET capability_hash = ?, assignee_pane_key = ?, process_incarnation = ?,
             capability_revoked_at = NULL
         WHERE id = ?`
      )
      .run(
        hashDispatchCapability(capability),
        params.paneKey,
        params.processIncarnation,
        params.dispatchId
      )
    return capability
  }

  verifyDispatchCapability(params: {
    dispatchId: string
    capability: string | undefined
    paneKey: string | undefined
    processIncarnation: string | undefined
  }): { valid: true } | { valid: false; reason: string } {
    const dispatch = this.getDispatchContextById(params.dispatchId)
    if (!dispatch) {
      return { valid: false, reason: `Dispatch ${params.dispatchId} was not found.` }
    }
    if (!dispatch.capability_hash) {
      return { valid: false, reason: `Dispatch ${params.dispatchId} has no lifecycle capability.` }
    }
    if (dispatch.capability_revoked_at) {
      return { valid: false, reason: `Dispatch ${params.dispatchId} capability is revoked.` }
    }
    if (!params.capability) {
      return { valid: false, reason: 'The Dispatch capability is missing.' }
    }
    const expected = Buffer.from(dispatch.capability_hash, 'hex')
    const observed = Buffer.from(hashDispatchCapability(params.capability), 'hex')
    if (expected.length !== observed.length || !timingSafeEqual(expected, observed)) {
      return { valid: false, reason: 'The Dispatch capability is invalid.' }
    }
    if (
      !dispatch.assignee_pane_key ||
      !params.paneKey ||
      !isEquivalentPaneKey(dispatch.assignee_pane_key, params.paneKey)
    ) {
      return { valid: false, reason: 'The caller is not the Dispatch pane.' }
    }
    if (
      !dispatch.process_incarnation ||
      !params.processIncarnation ||
      dispatch.process_incarnation !== params.processIncarnation
    ) {
      return { valid: false, reason: 'The Dispatch process incarnation changed.' }
    }
    return { valid: true }
  }

  revokeDispatchCapability(dispatchId: string): void {
    this.db
      .prepare(
        `UPDATE dispatch_contexts
         SET capability_revoked_at = COALESCE(capability_revoked_at, datetime('now'))
         WHERE id = ?`
      )
      .run(dispatchId)
  }

  getActiveDispatchForTerminal(handle: string): DispatchContextRow | undefined {
    return this.findActiveDispatchForAssignee(handle)
  }

  /**
   * Cheap "are there any dispatch rows at all" probe. When false, no terminal
   * can have an active or recent-completed dispatch, so orchestration-context
   * builders can skip their per-terminal query fan-out entirely. Cached after
   * the first probe; createDispatchContext marks it true, resets clear it.
   */
  hasAnyDispatchContexts(): boolean {
    if (this.hasAnyDispatchContextsCache === undefined) {
      const row = this.db.prepare('SELECT 1 FROM dispatch_contexts LIMIT 1').get()
      this.hasAnyDispatchContextsCache = row !== undefined
    }
    return this.hasAnyDispatchContextsCache
  }

  getActiveDispatchForIdentity(handle: string, paneKey?: string): DispatchContextRow | undefined {
    return this.findActiveDispatchForAssignee(handle, paneKey)
  }

  protected findActiveDispatchForAssignee(
    assigneeHandle: string,
    assigneePaneKey?: string
  ): DispatchContextRow | undefined {
    const byHandle = this.db
      .prepare(
        "SELECT * FROM dispatch_contexts WHERE assignee_handle = ? AND status IN ('pending', 'dispatched') LIMIT 1"
      )
      .get(assigneeHandle) as DispatchContextRow | undefined
    if (byHandle) {
      return byHandle
    }

    if (!assigneePaneKey) {
      return undefined
    }

    const actives = this.db
      .prepare(
        "SELECT * FROM dispatch_contexts WHERE assignee_pane_key IS NOT NULL AND status IN ('pending', 'dispatched')"
      )
      .all() as DispatchContextRow[]

    for (const row of actives) {
      if (row.assignee_pane_key && isEquivalentPaneKey(row.assignee_pane_key, assigneePaneKey)) {
        return row
      }
    }
    return undefined
  }

  getLatestDispatchForTerminal(handle: string): DispatchContextRow | undefined {
    return this.db
      .prepare(
        'SELECT * FROM dispatch_contexts WHERE assignee_handle = ? ORDER BY rowid DESC LIMIT 1'
      )
      .get(handle) as DispatchContextRow | undefined
  }

  completeDispatch(ctxId: string): void {
    this.db
      .prepare(
        "UPDATE dispatch_contexts SET status = 'completed', completed_at = datetime('now'), capability_revoked_at = COALESCE(capability_revoked_at, datetime('now')) WHERE id = ?"
      )
      .run(ctxId)
  }

  completeActiveDispatchForTask(taskId: string): void {
    const active = this.db
      .prepare(
        "SELECT * FROM dispatch_contexts WHERE task_id = ? AND status IN ('pending', 'dispatched') ORDER BY rowid DESC LIMIT 1"
      )
      .get(taskId) as DispatchContextRow | undefined
    if (active) {
      this.completeDispatch(active.id)
    }
  }

  settleWorkerReport(params: {
    taskId: string
    dispatchId: string
    outcome: WorkerReportOutcome
    result: string
  }): WorkerReportSettlement {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const settlement = this.settleWorkerReportInTransaction(params)
      this.db.exec('COMMIT')
      return settlement
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
