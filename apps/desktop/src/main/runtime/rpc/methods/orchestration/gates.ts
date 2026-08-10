import type {
  OrchestrationCoordinatorRunInput,
  OrchestrationEmptyInput,
  OrchestrationGateCreateInput,
  OrchestrationGateListInput,
  OrchestrationGateResolveInput
} from '@yiru/runtime-protocol/contract'
import { Coordinator } from '~main/runtime/orchestration/coordinator'
import type { GateStatus } from '~main/runtime/orchestration/db'
import type { RpcContext } from '~main/runtime/rpc/core'

// Why: only one coordinator can run at a time, and runStop must be able to signal it.
let activeCoordinator: Coordinator | null = null

export function handleOrchestrationCoordinatorRun(
  params: OrchestrationCoordinatorRunInput,
  { runtime }: RpcContext
) {
  const db = runtime.getOrchestrationDb()
  const existing = db.getActiveCoordinatorRun()
  if (existing) {
    throw new Error(`Coordinator already running: ${existing.id}`)
  }

  const coordinatorHandle = params.from ?? 'coordinator'
  const coordinator = new Coordinator(db, runtime, {
    spec: params.spec,
    coordinatorHandle,
    pollIntervalMs: params.pollIntervalMs,
    maxConcurrent: params.maxConcurrent,
    worktree: params.worktree
  })
  activeCoordinator = coordinator
  const run = db.createCoordinatorRun({
    spec: params.spec,
    coordinatorHandle,
    pollIntervalMs: params.pollIntervalMs
  })

  // Why: progress and completion are durable DB state, so this request returns immediately.
  coordinator.runFromExistingRun(run.id).finally(() => {
    if (activeCoordinator === coordinator) {
      activeCoordinator = null
    }
  })
  return { runId: run.id, status: 'running' as const }
}

export function handleOrchestrationCoordinatorRunStop(
  _params: OrchestrationEmptyInput,
  { runtime }: RpcContext
) {
  const run = runtime.getOrchestrationDb().getActiveCoordinatorRun()
  if (!run) {
    throw new Error('No active coordinator run')
  }
  if (activeCoordinator) {
    activeCoordinator.stop()
    activeCoordinator = null
  }
  return { runId: run.id, stopped: true as const }
}

export function handleOrchestrationGateCreate(
  params: OrchestrationGateCreateInput,
  { runtime }: RpcContext
) {
  let options: string[] | undefined
  if (params.options) {
    try {
      const parsed = JSON.parse(params.options)
      if (!Array.isArray(parsed) || !parsed.every((option) => typeof option === 'string')) {
        throw new Error('not an array of strings')
      }
      options = parsed
    } catch {
      throw new Error('Invalid --options: must be a JSON array of strings')
    }
  }
  return {
    gate: runtime.getOrchestrationDb().createGate({
      taskId: params.task,
      question: params.question,
      options
    })
  }
}

export function handleOrchestrationGateResolve(
  params: OrchestrationGateResolveInput,
  { runtime }: RpcContext
) {
  const gate = runtime.getOrchestrationDb().resolveGate(params.id, params.resolution)
  if (!gate) {
    throw new Error(`Gate not found: ${params.id}`)
  }
  return { gate }
}

export function handleOrchestrationGateList(
  params: OrchestrationGateListInput,
  { runtime }: RpcContext
) {
  const gates = runtime.getOrchestrationDb().listGates({
    taskId: params.task,
    status: params.status as GateStatus
  })
  return { gates, count: gates.length }
}
