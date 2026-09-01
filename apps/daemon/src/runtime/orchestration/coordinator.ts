import { processCoordinatorMessages } from './coordinator-messages'
import type { CoordinatorRuntime } from './coordinator-runtime'
import {
  dispatchCoordinatorTask,
  getAvailableCoordinatorTerminals
} from './coordinator-task-dispatch'
import type { OrchestrationDb } from './db'
import type { CoordinatorStatus, MessageRow } from './types'

export type { CoordinatorRuntime } from './coordinator-runtime'
export { DISPATCH_STALE_THRESHOLD, parseAllowStaleBaseFromSpec } from './coordinator-task-dispatch'

export type CoordinatorOptions = {
  spec: string
  coordinatorHandle: string
  pollIntervalMs?: number
  maxConcurrent?: number
  worktree?: string
  onLog?: (message: string) => void
}

type CoordinatorState = {
  runId: string
  phase: 'decomposing' | 'dispatching' | 'monitoring' | 'merging' | 'done'
  completedTasks: string[]
  failedTasks: string[]
  escalations: MessageRow[]
}

type CoordinatorResult = {
  runId: string
  status: CoordinatorStatus
  completedTasks: string[]
  failedTasks: string[]
  escalations: MessageRow[]
}

const DEFAULT_POLL_MS = 2000
const MAX_CONCURRENT_DEFAULT = 4
const HUNG_THRESHOLD_MS = 10 * 60 * 1000

function appendUnique(target: string[], values: string[]): void {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value)
    }
  }
}

export class Coordinator {
  private db: OrchestrationDb
  private runtime: CoordinatorRuntime
  private state: CoordinatorState
  private stopped = false
  private opts: Required<Omit<CoordinatorOptions, 'onLog' | 'worktree'>> & {
    onLog: (message: string) => void
    worktree?: string
  }

  constructor(db: OrchestrationDb, runtime: CoordinatorRuntime, options: CoordinatorOptions) {
    this.db = db
    this.runtime = runtime
    this.opts = {
      spec: options.spec,
      coordinatorHandle: options.coordinatorHandle,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_MS,
      maxConcurrent: options.maxConcurrent ?? MAX_CONCURRENT_DEFAULT,
      worktree: options.worktree,
      onLog: options.onLog ?? (() => {})
    }
    this.state = {
      runId: '',
      phase: 'decomposing',
      completedTasks: [],
      failedTasks: [],
      escalations: []
    }
  }

  async run(): Promise<CoordinatorResult> {
    const run = this.db.createCoordinatorRun({
      spec: this.opts.spec,
      coordinatorHandle: this.opts.coordinatorHandle,
      pollIntervalMs: this.opts.pollIntervalMs
    })
    return this.executeLoop(run.id)
  }

  // Why: the RPC handler creates the row first so it can return the ID immediately.
  async runFromExistingRun(runId: string): Promise<CoordinatorResult> {
    return this.executeLoop(runId)
  }

  private async executeLoop(runId: string): Promise<CoordinatorResult> {
    this.state.runId = runId
    this.opts.onLog(`Coordinator run ${runId} started`)
    try {
      this.decompose()
      while (!this.stopped) {
        if (await this.tick()) {
          break
        }
        await this.sleep(this.opts.pollIntervalMs)
      }

      const tasks = this.db.listTasks()
      const allDone = tasks.every((task) => task.status === 'completed' || task.status === 'failed')
      const failedTasks = [
        ...new Set([
          ...this.state.failedTasks,
          ...tasks.filter((task) => task.status === 'failed').map((task) => task.id)
        ])
      ]
      const finalStatus =
        this.stopped || failedTasks.length > 0 || !allDone ? 'failed' : 'completed'
      this.db.updateCoordinatorRun(runId, finalStatus)
      this.opts.onLog(`Coordinator run ${runId} ${finalStatus}`)
      return {
        runId,
        status: finalStatus,
        completedTasks: this.state.completedTasks,
        failedTasks,
        escalations: this.state.escalations
      }
    } catch (error) {
      this.db.updateCoordinatorRun(runId, 'failed')
      throw error
    }
  }

  stop(): void {
    this.stopped = true
  }

  private decompose(): void {
    this.state.phase = 'decomposing'
    const existing = this.db.listTasks()
    if (existing.length === 0) {
      throw new Error(
        'No tasks found. Create tasks with orchestration.taskCreate before running the coordinator.'
      )
    }
    this.opts.onLog(`Found ${existing.length} tasks in DAG`)
    this.state.phase = 'dispatching'
  }

  private async tick(): Promise<boolean> {
    const outcome = processCoordinatorMessages(
      this.db,
      this.opts.coordinatorHandle,
      this.opts.onLog
    )
    appendUnique(this.state.completedTasks, outcome.completedTaskIds)
    appendUnique(this.state.failedTasks, outcome.failedTaskIds)
    this.state.escalations.push(...outcome.escalations)
    this.processDecisionGates()
    this.warnStaleDispatches()
    await this.dispatchReadyTasks()
    return this.checkConvergence()
  }

  private warnStaleDispatches(): void {
    const thresholdIso = new Date(Date.now() - HUNG_THRESHOLD_MS).toISOString()
    for (const context of this.db.getStaleDispatches(thresholdIso)) {
      const minutes = Math.round(HUNG_THRESHOLD_MS / 60_000)
      this.opts.onLog(
        `Warning: worker ${context.assignee_handle ?? '<unknown>'} on task ${context.task_id} has not sent a heartbeat in ~${minutes} min (dispatch ${context.id})`
      )
    }
  }

  private processDecisionGates(): void {
    for (const gate of this.db.listGates({ status: 'pending' })) {
      const task = this.db.getTask(gate.task_id)
      if (task && task.status !== 'blocked') {
        this.db.updateTaskStatus(gate.task_id, 'blocked')
      }
    }
  }

  private async dispatchReadyTasks(): Promise<void> {
    this.state.phase = 'dispatching'
    const readyTasks = this.db.listTasks({ ready: true })
    if (readyTasks.length === 0) {
      return
    }
    let slotsAvailable =
      this.opts.maxConcurrent - this.db.listTasks({ status: 'dispatched' }).length
    if (slotsAvailable <= 0) {
      return
    }
    const terminals = await getAvailableCoordinatorTerminals({
      db: this.db,
      runtime: this.runtime,
      coordinatorHandle: this.opts.coordinatorHandle,
      worktree: this.opts.worktree
    })
    if (terminals.length === 0) {
      try {
        const created = await this.runtime.createTerminal(this.opts.worktree, {
          title: `Worker: ${readyTasks[0].spec.slice(0, 40)}`
        })
        terminals.push(created.handle)
        this.opts.onLog(`Created worker terminal ${created.handle}`)
      } catch (error) {
        this.opts.onLog(`Failed to create terminal: ${String(error)}`)
        return
      }
    }

    for (const task of readyTasks) {
      const targetHandle = terminals.shift()
      if (slotsAvailable <= 0 || !targetHandle) {
        break
      }
      slotsAvailable--
      try {
        const dispatched = await dispatchCoordinatorTask({
          db: this.db,
          runtime: this.runtime,
          task,
          targetHandle,
          coordinatorHandle: this.opts.coordinatorHandle,
          worktree: this.opts.worktree,
          onLog: this.opts.onLog,
          onCircuitBroken: (taskId) => appendUnique(this.state.failedTasks, [taskId])
        })
        if (dispatched) {
          this.state.phase = 'monitoring'
        }
      } catch (error) {
        this.opts.onLog(`Failed to dispatch task ${task.id}: ${String(error)}`)
      }
    }
  }

  private checkConvergence(): boolean {
    const tasks = this.db.listTasks()
    if (tasks.length === 0) {
      return true
    }
    const allDone = tasks.every((task) => task.status === 'completed' || task.status === 'failed')
    if (allDone) {
      this.state.phase = 'done'
      return true
    }
    const active = tasks.filter(
      (task) => task.status === 'ready' || task.status === 'dispatched' || task.status === 'pending'
    )
    const blocked = tasks.filter((task) => task.status === 'blocked')
    if (active.length === 0 && blocked.length > 0) {
      this.opts.onLog(
        `Stuck: ${blocked.length} tasks blocked with no active tasks. Resolve decision gates to continue.`
      )
    }
    return false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
