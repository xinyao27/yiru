import type {
  OrchestrationTaskCreateInput,
  OrchestrationTaskListInput,
  OrchestrationTaskUpdateInput
} from '@yiru/runtime-protocol/contract'
import { abbreviateOrchestrationTasks } from '~main/orchestration/task-summary'
import type { TaskStatus } from '~main/runtime/orchestration/db'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { RpcContext } from '~main/runtime/rpc/core'

import { resolveRunScope } from './run-scope'

export function handleOrchestrationTaskCreate(
  params: OrchestrationTaskCreateInput,
  { runtime }: RpcContext
) {
  const db = runtime.getOrchestrationDb()
  let deps: string[] | undefined
  if (params.deps) {
    try {
      const parsed = JSON.parse(params.deps)
      if (!Array.isArray(parsed) || !parsed.every((dependency) => typeof dependency === 'string')) {
        throw new Error('not an array of strings')
      }
      deps = parsed
    } catch {
      throw new Error('Invalid --deps: must be a JSON array of task IDs')
    }
  }
  const task = db.createTask({
    spec: params.spec,
    taskTitle: params.taskTitle,
    displayName: params.displayName,
    deps,
    parentId: params.parent,
    createdByTerminalHandle: params.callerTerminalHandle,
    runId: resolveRunScope(runtime, {
      runId: params.run,
      callerTerminalHandle: params.callerTerminalHandle,
      requireCurrentConsumer: true
    }).id
  })
  return { task }
}

export function handleOrchestrationTaskList(
  params: OrchestrationTaskListInput,
  { runtime }: RpcContext
) {
  const db = runtime.getOrchestrationDb()
  const explicitRun = params.run ? db.getRun(params.run) : undefined
  const run =
    explicitRun?.legacy === 1
      ? explicitRun
      : resolveRunScope(runtime, {
          runId: params.run,
          callerTerminalHandle: params.callerTerminalHandle,
          requireCurrentConsumer: params.run === undefined
        })
  // Why: listTasksWithDispatch adds assignee_handle + dispatch_id (NULL for non-dispatched), so legacy-shape consumers are unaffected.
  const joined = db.listTasksWithDispatch({
    status: params.status as TaskStatus,
    ready: params.ready,
    runId: run.id
  })
  const tasks = joined.map((row) => {
    const { assignee_handle, dispatch_id, ...base } = row
    if (base.status === 'dispatched') {
      return { ...base, assignee_handle, dispatch_id }
    }
    return base
  })
  return {
    runId: run.id,
    legacyReadOnly: run.legacy === 1,
    tasks: params.brief ? abbreviateOrchestrationTasks(tasks) : tasks,
    count: tasks.length
  }
}

export function handleOrchestrationTaskUpdate(
  params: OrchestrationTaskUpdateInput,
  { runtime }: RpcContext
) {
  const db = runtime.getOrchestrationDb()
  const run = resolveRunScope(runtime, {
    runId: params.run,
    callerTerminalHandle: params.callerTerminalHandle,
    requireCurrentConsumer: true
  })
  const existing = db.getTask(params.id)
  if (!existing || existing.run_id !== run.id) {
    throw new OrchestrationError(
      'task_not_found',
      `Task ${params.id} was not found in Run ${run.id}.`
    )
  }
  const task = db.updateTaskStatus(params.id, params.status, params.result)
  if (!task) {
    throw new Error(`Task not found: ${params.id}`)
  }
  return { task }
}
