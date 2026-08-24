import type Database from '~main/sqlite/sync-database'
import { buildOrchestrationTaskDisplayMetadata } from '~shared/orchestration-task-display'

import { generateId, LEGACY_RUN_ID } from './orchestration-db-foundation'
import { OrchestrationDbLayer5 } from './orchestration-db-layer-5'
import type { TaskStatus, TaskRow } from './types'

export abstract class OrchestrationDbLayer6 extends OrchestrationDbLayer5 {
  closeQuestionsForDispatch(dispatchId: string): string[] {
    const rows = this.db
      .prepare(
        "SELECT message_id FROM question_threads WHERE dispatch_id = ? AND status = 'pending'"
      )
      .all(dispatchId) as { message_id: string }[]
    if (rows.length === 0) {
      return []
    }
    this.db
      .prepare(
        "UPDATE question_threads SET status = 'closed', closed_at = datetime('now') WHERE dispatch_id = ? AND status = 'pending'"
      )
      .run(dispatchId)
    return rows.map((row) => row.message_id)
  }

  // ── Tasks ──

  createTask(task: {
    spec: string
    taskTitle?: string
    displayName?: string
    deps?: string[]
    parentId?: string
    createdByTerminalHandle?: string
    runId?: string
  }): TaskRow {
    const runId = task.runId ?? LEGACY_RUN_ID
    this.requireRun(runId)
    if (task.parentId) {
      const parent = this.getTask(task.parentId)
      if (!parent || parent.run_id !== runId) {
        throw new Error(`Parent task ${task.parentId} must belong to run ${runId}`)
      }
    }
    for (const depId of task.deps ?? []) {
      const dependency = this.getTask(depId)
      if (!dependency || dependency.run_id !== runId) {
        throw new Error(`Dependency task ${depId} must belong to run ${runId}`)
      }
    }
    const id = generateId('task')
    const depsJson = JSON.stringify(task.deps ?? [])
    const hasDeps = (task.deps ?? []).length > 0
    const status: TaskStatus = hasDeps ? 'pending' : 'ready'
    const display = buildOrchestrationTaskDisplayMetadata({
      spec: task.spec,
      taskTitle: task.taskTitle,
      displayName: task.displayName
    })
    this.db
      .prepare(
        'INSERT INTO tasks (id, run_id, parent_id, created_by_terminal_handle, task_title, display_name, spec, status, deps) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        runId,
        task.parentId ?? null,
        task.createdByTerminalHandle ?? null,
        display.taskTitle || null,
        display.displayName || null,
        task.spec,
        status,
        depsJson
      )
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow
  }

  getTask(id: string): TaskRow | undefined {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
  }

  listTasks(filter?: { status?: TaskStatus; ready?: boolean; runId?: string }): TaskRow[] {
    const runWhere = filter?.runId ? 'run_id = ? AND ' : ''
    const runParams: Database.BindValue[] = filter?.runId ? [filter.runId] : []
    if (filter?.ready) {
      return this.db
        .prepare(`SELECT * FROM tasks WHERE ${runWhere}status = 'ready' ORDER BY created_at`)
        .all(...runParams) as TaskRow[]
    }
    if (filter?.status) {
      return this.db
        .prepare(`SELECT * FROM tasks WHERE ${runWhere}status = ? ORDER BY created_at`)
        .all(...runParams, filter.status) as TaskRow[]
    }
    if (filter?.runId) {
      return this.db
        .prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY created_at')
        .all(filter.runId) as TaskRow[]
    }
    return this.db.prepare('SELECT * FROM tasks ORDER BY created_at').all() as TaskRow[]
  }

  // Why: LEFT JOIN keeps non-dispatched tasks (NULL assignee); the MAX(rowid) subquery matches getDispatchContext's most-recent-active-dispatch semantics.
  listTasksWithDispatch(filter?: {
    status?: TaskStatus
    ready?: boolean
    runId?: string
  }): (TaskRow & {
    assignee_handle: string | null
    dispatch_id: string | null
  })[] {
    const whereClauses: string[] = []
    const params: Database.BindValue[] = []
    if (filter?.runId) {
      whereClauses.push('t.run_id = ?')
      params.push(filter.runId)
    }
    if (filter?.ready) {
      whereClauses.push("t.status = 'ready'")
    } else if (filter?.status) {
      whereClauses.push('t.status = ?')
      params.push(filter.status)
    }
    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const sql = `
      SELECT
        t.*,
        d.assignee_handle AS assignee_handle,
        d.id              AS dispatch_id
      FROM tasks t
      LEFT JOIN (
        SELECT dc.*
        FROM dispatch_contexts dc
        INNER JOIN (
          SELECT task_id, MAX(rowid) AS max_rowid
          FROM dispatch_contexts
          WHERE status IN ('pending', 'dispatched')
          GROUP BY task_id
        ) latest ON latest.task_id = dc.task_id AND latest.max_rowid = dc.rowid
      ) d ON d.task_id = t.id
      ${where}
      ORDER BY t.created_at
    `
    return this.db.prepare(sql).all(...params) as (TaskRow & {
      assignee_handle: string | null
      dispatch_id: string | null
    })[]
  }

  updateTaskStatus(id: string, status: TaskStatus, result?: string): TaskRow | undefined {
    const completedAt =
      status === 'completed' || status === 'failed' ? new Date().toISOString() : null
    this.db
      .prepare(
        'UPDATE tasks SET status = ?, result = COALESCE(?, result), completed_at = COALESCE(?, completed_at) WHERE id = ?'
      )
      .run(status, result ?? null, completedAt, id)

    if (status === 'completed') {
      this.promoteReadyTasks(id)
      this.completeActiveDispatchForTask(id)
    }

    return this.getTask(id)
  }

  // Why: runs in the status-update transaction, so a completed task never leaves its ready children unpromoted.
  protected promoteReadyTasks(completedTaskId: string): void {
    const candidates = this.db
      .prepare("SELECT * FROM tasks WHERE status = 'pending'")
      .all() as TaskRow[]

    for (const task of candidates) {
      const deps: string[] = JSON.parse(task.deps)
      if (!deps.includes(completedTaskId)) {
        continue
      }

      const allDepsCompleted = deps.every((depId) => {
        const dep = this.getTask(depId)
        return dep?.status === 'completed'
      })
      if (allDepsCompleted) {
        this.db.prepare("UPDATE tasks SET status = 'ready' WHERE id = ?").run(task.id)
      }
    }
  }
}
