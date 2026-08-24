import type { CoordinatorRuntime } from './coordinator-runtime'
import type { OrchestrationDb } from './db'
import { buildDispatchPreamble } from './preamble'
import type { TaskRow } from './types'

export const DISPATCH_STALE_THRESHOLD = 20

const ALLOW_STALE_BASE_RE = /^[ \t]*allow-stale-base:[ \t]*true[ \t]*\r?$/im
const ALLOW_STALE_BASE_STRIP_RE = /^[ \t]*allow-stale-base:[ \t]*true[ \t]*\r?\n?/im

export function parseAllowStaleBaseFromSpec(spec: string): {
  allowStale: boolean
  strippedSpec: string
} {
  if (!ALLOW_STALE_BASE_RE.test(spec)) {
    return { allowStale: false, strippedSpec: spec }
  }
  return {
    allowStale: true,
    strippedSpec: spec.replace(ALLOW_STALE_BASE_STRIP_RE, '')
  }
}

type DispatchTaskOptions = {
  db: OrchestrationDb
  runtime: CoordinatorRuntime
  task: TaskRow
  targetHandle: string
  coordinatorHandle: string
  worktree?: string
  onLog: (message: string) => void
  onCircuitBroken: (taskId: string) => void
}

export async function dispatchCoordinatorTask(options: DispatchTaskOptions): Promise<boolean> {
  const { allowStale, strippedSpec } = parseAllowStaleBaseFromSpec(options.task.spec)
  let baseDrift: {
    base: string
    behind: number
    recentSubjects: string[]
  } | null = null

  if (!options.worktree) {
    options.onLog(
      `stale-base guard inert for ${options.task.id}: coordinator has no worktree selector`
    )
  } else {
    baseDrift = await options.runtime.probeWorktreeDrift(options.worktree).catch((error) => {
      options.onLog(`probeWorktreeDrift failed for ${options.worktree}: ${error}`)
      return null
    })
    if (baseDrift && baseDrift.behind > DISPATCH_STALE_THRESHOLD && !allowStale) {
      options.onLog(
        `Skipping dispatch of ${options.task.id}: worktree is ${baseDrift.behind} commits ` +
          `behind ${baseDrift.base}. Pull/rebase the worktree, recreate it with ` +
          `--base-branch ${baseDrift.base}, or include 'allow-stale-base: true' ` +
          `in the task spec to override. Task remains in 'ready'; coordinator ` +
          `will retry on the next tick.`
      )
      return false
    }
  }

  const dispatch = options.db.createDispatchContext(
    options.task.id,
    options.targetHandle,
    options.runtime.getTerminalPaneKey?.(options.targetHandle) ?? undefined
  )
  const preamble = buildDispatchPreamble({
    taskId: options.task.id,
    dispatchId: dispatch.id,
    taskSpec: strippedSpec,
    coordinatorHandle: options.coordinatorHandle,
    workerHandle: options.targetHandle,
    ...(options.runtime.getTerminalOrchestrationCliCommand
      ? { cliCommand: options.runtime.getTerminalOrchestrationCliCommand(options.targetHandle) }
      : {}),
    ...(baseDrift ? { baseDrift } : {})
  })

  const gates = options.db.listGates({ taskId: options.task.id, status: 'resolved' })
  const latestGate = gates.at(-1)
  const gateContext = latestGate
    ? `\n\n--- DECISION GATE RESOLVED ---\nQuestion: ${latestGate.question}\nResolution: ${latestGate.resolution}\n---\n`
    : ''
  try {
    await options.runtime.sendTerminalAgentPrompt(options.targetHandle, preamble + gateContext)
  } catch (error) {
    const updated = options.db.failDispatch(
      dispatch.id,
      error instanceof Error ? error.message : String(error)
    )
    if (updated?.status === 'circuit_broken') {
      options.onCircuitBroken(options.task.id)
    }
    throw error
  }
  options.onLog(`Dispatched task ${options.task.id} to ${options.targetHandle}`)
  return true
}

export async function getAvailableCoordinatorTerminals(options: {
  db: OrchestrationDb
  runtime: CoordinatorRuntime
  coordinatorHandle: string
  worktree?: string
}): Promise<string[]> {
  try {
    const result = await options.runtime.listTerminals(options.worktree)
    const dispatched = options.db.listTasks({ status: 'dispatched' })
    const busyHandles = new Set<string>()
    for (const task of dispatched) {
      const context = options.db.getDispatchContext(task.id)
      if (context?.assignee_handle) {
        busyHandles.add(context.assignee_handle)
      }
    }
    return result.terminals
      .filter(
        (terminal) =>
          terminal.handle !== options.coordinatorHandle &&
          !busyHandles.has(terminal.handle) &&
          terminal.connected &&
          terminal.writable
      )
      .map((terminal) => terminal.handle)
  } catch {
    return []
  }
}
