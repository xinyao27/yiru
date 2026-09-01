import type {
  OrchestrationDispatchInput,
  OrchestrationDispatchResult,
  OrchestrationDispatchShowInput
} from '@yiru/runtime-protocol/contract'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import { buildDispatchPreamble } from '~main/runtime/orchestration/preamble'
import type { RpcContext } from '~main/runtime/rpc/core'

import { resolveRunScope } from './run-scope'

export async function handleOrchestrationDispatch(
  params: OrchestrationDispatchInput,
  { runtime }: RpcContext
): Promise<OrchestrationDispatchResult> {
  const db = runtime.getOrchestrationDb()
  const task = db.getTask(params.task)
  if (!task) {
    throw new Error(`Task not found: ${params.task}`)
  }
  const run = resolveRunScope(runtime, {
    runId: params.run,
    callerTerminalHandle: params.from,
    requireCurrentConsumer: true
  })
  if (task.run_id !== run.id) {
    throw new OrchestrationError(
      'task_not_found',
      `Task ${task.id} was not found in Run ${run.id}.`
    )
  }

  // Why: dry-run previews the preamble without mutating state, so it skips the ready-status check and uses a placeholder dispatchId.
  if (params.dryRun) {
    const preamble = buildDispatchPreamble({
      taskId: task.id,
      dispatchId: 'ctx_dryrun',
      taskSpec: task.spec,
      coordinatorHandle: params.from ?? 'coordinator',
      workerHandle: params.to ?? 'worker',
      devMode: params.devMode,
      ...(params.to ? { cliCommand: runtime.getTerminalOrchestrationCliCommand(params.to) } : {})
    })
    return { dispatch: null, injected: false, dryRun: true, preamble }
  }

  if (!params.to) {
    throw new Error('Missing --to')
  }
  const to = params.to
  if (task.status !== 'ready') {
    throw new Error(`Task ${params.task} is ${task.status}; only ready tasks can be dispatched`)
  }

  // Why: injecting the preamble into a bare shell dumps it as shell commands, so require a detected agent first.
  if (params.inject && !(await runtime.isTerminalRunningAgent(to))) {
    throw new Error(
      `Cannot dispatch --inject to terminal ${to}: no recognized agent detected. ` +
        'Start an agent CLI (e.g. claude, codex, gemini, droid, cursor) in the terminal first, ' +
        'or dispatch without --inject and send the prompt manually.'
    )
  }

  const assigneePaneKey = runtime.getTerminalPaneKey(to) ?? undefined
  const processIncarnation = runtime.getTerminalProcessIncarnation(to) ?? undefined
  if (params.inject && (!assigneePaneKey || !processIncarnation)) {
    throw new OrchestrationError(
      'stable_pane_required',
      `Terminal ${to} has no stable pane/process incarnation for lifecycle authority.`
    )
  }

  const dispatch = db.createDispatchContext(params.task, to, assigneePaneKey)
  const dispatchCapability = params.inject
    ? db.mintDispatchCapability({
        dispatchId: dispatch.id,
        paneKey: assigneePaneKey as string,
        processIncarnation: processIncarnation as string
      })
    : undefined
  const preamble = buildDispatchPreamble({
    taskId: task.id,
    dispatchId: dispatch.id,
    taskSpec: task.spec,
    coordinatorHandle: params.from ?? 'coordinator',
    workerHandle: to,
    dispatchCapability,
    devMode: params.devMode,
    cliCommand: runtime.getTerminalOrchestrationCliCommand(to)
  })

  let injected = false
  if (params.inject) {
    try {
      await runtime.sendTerminalAgentPrompt(to, preamble)
      injected = true
    } catch (error) {
      db.failDispatch(dispatch.id, error instanceof Error ? error.message : String(error))
      throw error
    }
  }
  return params.returnPreamble ? { dispatch, injected, preamble } : { dispatch, injected }
}

export function handleOrchestrationDispatchShow(
  params: OrchestrationDispatchShowInput,
  { runtime }: RpcContext
) {
  const db = runtime.getOrchestrationDb()
  if (!params.task) {
    throw new Error('Missing --task')
  }
  const dispatch = db.getDispatchContext(params.task)
  if (!params.preamble) {
    return { dispatch: dispatch ?? null }
  }
  const task = db.getTask(params.task)
  if (!task) {
    throw new Error(`Task not found: ${params.task}`)
  }
  const workerHandle = dispatch?.assignee_handle ?? 'worker'
  const preamble = buildDispatchPreamble({
    taskId: task.id,
    dispatchId: dispatch?.id ?? 'ctx_preview',
    taskSpec: task.spec,
    coordinatorHandle: params.from ?? 'coordinator',
    workerHandle,
    devMode: params.devMode,
    ...(dispatch ? { cliCommand: runtime.getTerminalOrchestrationCliCommand(workerHandle) } : {})
  })
  return { dispatch: dispatch ?? null, preamble }
}
