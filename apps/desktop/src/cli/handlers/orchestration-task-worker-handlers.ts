import { abbreviateOrchestrationTasks } from '~shared/orchestration-task-summary'

import type { CommandHandler } from '../dispatch'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import {
  callOrchestrationMutation,
  getOptionalChoiceFlag,
  getOptionalPositiveIntegerValueFlag,
  isDevCliInvocation,
  requireChoice,
  TASK_STATUS_VALUES,
  WORKER_READ_SOURCE_VALUES,
  WORKER_SETUP_VALUES
} from './orchestration-handler-flags'
import { resolveCoordinatorTerminalHandle } from './orchestration-handler-terminal'
import { formatWorkerRead } from './orchestration-message-output'

export const ORCHESTRATION_TASK_WORKER_HANDLERS: Record<string, CommandHandler> = {
  'orchestration task-create': async ({ flags, client, cwd, json }) => {
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.taskCreate,
      {
        spec: getRequiredStringFlag(flags, 'spec'),
        taskTitle: getOptionalStringFlag(flags, 'task-title'),
        displayName: getOptionalStringFlag(flags, 'display-name'),
        deps: getOptionalStringFlag(flags, 'deps'),
        parent: getOptionalStringFlag(flags, 'parent'),
        run: getOptionalStringFlag(flags, 'run'),
        callerTerminalHandle: await resolveCoordinatorTerminalHandle(flags, cwd, client)
      }
    )
    printResult(result, json, (value) => `Created ${value.task.id} [${value.task.status}]`)
  },
  'orchestration task-list': async ({ flags, client, cwd, json }) => {
    const brief = flags.has('brief')
    const run = getOptionalStringFlag(flags, 'run')
    const callerTerminalHandle = run
      ? undefined
      : await resolveCoordinatorTerminalHandle(flags, cwd, client)
    const result = await client.call(client.rpc.orchestration.taskList, {
      status: getOptionalChoiceFlag(flags, 'status', TASK_STATUS_VALUES),
      ready: flags.has('ready') ? true : undefined,
      brief: brief ? true : undefined,
      run,
      callerTerminalHandle
    })
    const needsAbbreviation =
      brief && result.result.tasks.some((task) => task.spec_truncated === undefined)
    const output = needsAbbreviation
      ? {
          ...result,
          result: { ...result.result, tasks: abbreviateOrchestrationTasks(result.result.tasks) }
        }
      : result
    printResult(output, json, (value) => {
      if (value.count === 0) {
        return value.legacyReadOnly ? 'No legacy tasks (read-only).' : 'No tasks.'
      }
      const tasks = value.tasks
        .map((task) => {
          const label = task.display_name ?? task.task_title ?? task.spec
          const head = `${task.id} [${task.status}] ${label.slice(0, 60)}`
          return task.status === 'dispatched' && task.assignee_handle
            ? `${head} -> ${task.assignee_handle} (${task.dispatch_id ?? '?'})`
            : head
        })
        .join('\n')
      return value.legacyReadOnly ? `Legacy Run ${value.runId} (read-only)\n${tasks}` : tasks
    })
  },
  'orchestration task-update': async ({ flags, client, cwd, json }) => {
    const statusValue = getRequiredStringFlag(flags, 'status')
    const status = requireChoice(
      statusValue,
      TASK_STATUS_VALUES,
      `invalid status '${statusValue}', expected one of: ${TASK_STATUS_VALUES.join(', ')}`
    )
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.taskUpdate,
      {
        id: getRequiredStringFlag(flags, 'id'),
        status,
        result: getOptionalStringFlag(flags, 'result'),
        run: getOptionalStringFlag(flags, 'run'),
        callerTerminalHandle: await resolveCoordinatorTerminalHandle(flags, cwd, client)
      }
    )
    printResult(result, json, (value) => `Updated ${value.task.id} -> ${value.task.status}`)
  },
  'orchestration worker-start': async ({ flags, client, cwd, json }) => {
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.workerStart,
      {
        task: getRequiredStringFlag(flags, 'task'),
        on: getOptionalStringFlag(flags, 'on'),
        worktree: getOptionalStringFlag(flags, 'worktree'),
        name: getOptionalStringFlag(flags, 'name'),
        repo: getOptionalStringFlag(flags, 'repo'),
        baseBranch: getOptionalStringFlag(flags, 'base-branch'),
        displayName: getOptionalStringFlag(flags, 'display-name'),
        comment: getOptionalStringFlag(flags, 'comment'),
        setup: getOptionalChoiceFlag(flags, 'setup', WORKER_SETUP_VALUES),
        agent: getOptionalStringFlag(flags, 'agent'),
        terminal: getOptionalStringFlag(flags, 'terminal'),
        retryOf: getOptionalStringFlag(flags, 'retry-of'),
        timeoutMs: getOptionalPositiveIntegerValueFlag(flags, 'timeout-ms'),
        run: getOptionalStringFlag(flags, 'run'),
        from: await resolveCoordinatorTerminalHandle(flags, cwd, client),
        devMode: isDevCliInvocation()
      }
    )
    if (result.result.state !== 'ready') {
      process.exitCode = 1
    }
    printResult(result, json, (worker) => {
      const base = `Worker ${worker.dispatchId} [${worker.state}] for ${worker.taskId}`
      if (worker.lastError) {
        return `${base}\n${worker.failedStage ?? 'start'}: ${worker.lastError}`
      }
      return worker.warning ? `${base}\nWarning: ${worker.warning}` : base
    })
  },
  'orchestration worker-show': async ({ flags, client, json }) => {
    const result = await client.call(client.rpc.orchestration.workerShow, {
      dispatch: getRequiredStringFlag(flags, 'dispatch')
    })
    printResult(result, json, (value) => {
      const task = value.dispatch ? ` task=${value.dispatch.task_id}` : ''
      return `${value.dispatch?.id ?? value.worker.dispatch_id}${task} [${value.worker.state}] stage=${value.worker.stage}`
    })
  },
  'orchestration worker-read': async ({ flags, client, json }) => {
    const cursorFlag = getOptionalStringFlag(flags, 'cursor')
    const cursor =
      cursorFlag !== undefined && /^\d+$/.test(cursorFlag)
        ? Number.parseInt(cursorFlag, 10)
        : cursorFlag
    const result = await client.call(client.rpc.orchestration.workerRead, {
      dispatch: getRequiredStringFlag(flags, 'dispatch'),
      cursor,
      limit: getOptionalPositiveIntegerFlag(flags, 'limit'),
      source: getOptionalChoiceFlag(flags, 'source', WORKER_READ_SOURCE_VALUES)
    })
    printResult(result, json, formatWorkerRead)
  },
  'orchestration worker-stop': async ({ flags, client, json }) => {
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.workerStop,
      { dispatch: getRequiredStringFlag(flags, 'dispatch') }
    )
    if (result.result.state === 'stop_unknown') {
      process.exitCode = 1
    }
    printResult(
      result,
      json,
      (value) =>
        `Worker ${value.dispatchId} [${value.state}] process=${value.processAction}${value.lastError ? `\n${value.lastError}` : ''}`
    )
  },
  'orchestration worker-abandon': async ({ flags, client, json }) => {
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.workerAbandon,
      { dispatch: getRequiredStringFlag(flags, 'dispatch') }
    )
    printResult(
      result,
      json,
      (value) => `Worker ${value.dispatchId} [${value.state}]\nWarning: ${value.warning}`
    )
  }
}
