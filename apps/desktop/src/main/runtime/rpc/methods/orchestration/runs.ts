import type {
  OrchestrationEmptyInput,
  OrchestrationRunCreateInput,
  OrchestrationRunCurrentInput,
  OrchestrationRunShowInput,
  OrchestrationRunUseInput
} from '@yiru/runtime-protocol/contract'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { RpcContext } from '~main/runtime/rpc/core'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'
import { parsePaneKey } from '~shared/stable-pane-id'

function requireCallerPane(runtime: YiruRuntimeService, handle: string): string {
  const paneKey = runtime.getTerminalPaneKey(handle)
  if (!paneKey) {
    throw new OrchestrationError(
      'stable_pane_required',
      'The coordinator terminal has no stable pane identity. Run this command inside a live Yiru terminal.'
    )
  }
  return paneKey
}

function paneKeysMatch(a: string, b: string): boolean {
  if (a === b) {
    return true
  }
  const aLeaf = parsePaneKey(a)?.leafId
  const bLeaf = parsePaneKey(b)?.leafId
  return Boolean(aLeaf && bLeaf && aLeaf === bLeaf)
}

export function handleOrchestrationRunCreate(
  params: OrchestrationRunCreateInput,
  { runtime }: RpcContext
) {
  const paneKey = requireCallerPane(runtime, params.from)
  const db = runtime.getOrchestrationDb()
  const priorRun = db.getCurrentRunForPane(paneKey)
  const run = db.createRun({
    objective: params.objective,
    coordinatorHandle: params.from,
    coordinatorPaneKey: paneKey
  })
  if (priorRun) {
    runtime.cancelMessageWaiters(`run:${priorRun.id}`)
  }
  return { run, binding: { consumerGeneration: run.consumer_generation } }
}

export function handleOrchestrationRunUse(
  params: OrchestrationRunUseInput,
  { runtime }: RpcContext
) {
  const paneKey = requireCallerPane(runtime, params.from)
  const db = runtime.getOrchestrationDb()
  const priorRun = db.getCurrentRunForPane(paneKey)
  const targetRun = db.getRun(params.id)
  const liveTargetPane = targetRun?.coordinator_handle
    ? runtime.getTerminalPaneKey(targetRun.coordinator_handle)
    : null
  if (liveTargetPane && !paneKeysMatch(liveTargetPane, paneKey)) {
    throw new OrchestrationError(
      'run_in_use',
      `Run ${params.id} is already bound to another live coordinator.`
    )
  }
  const run = db.bindRun({
    runId: params.id,
    coordinatorHandle: params.from,
    coordinatorPaneKey: paneKey
  })
  if (!run) {
    throw new OrchestrationError(
      'run_not_found',
      `Run ${params.id} was not found or is inspect-only.`
    )
  }
  runtime.cancelMessageWaiters(`run:${params.id}`)
  if (priorRun && priorRun.id !== params.id) {
    runtime.cancelMessageWaiters(`run:${priorRun.id}`)
  }
  return { run, binding: { consumerGeneration: run.consumer_generation } }
}

export function handleOrchestrationRunCurrent(
  params: OrchestrationRunCurrentInput,
  { runtime }: RpcContext
) {
  const paneKey = requireCallerPane(runtime, params.from)
  return { run: runtime.getOrchestrationDb().getCurrentRunForPane(paneKey) ?? null }
}

export function handleOrchestrationRunList(
  _params: OrchestrationEmptyInput,
  { runtime }: RpcContext
) {
  return { runs: runtime.getOrchestrationDb().listRuns() }
}

export function handleOrchestrationRunShow(
  params: OrchestrationRunShowInput,
  { runtime }: RpcContext
) {
  const run = runtime.getOrchestrationDb().getRun(params.id)
  if (!run) {
    throw new OrchestrationError('run_not_found', `Run ${params.id} was not found.`)
  }
  return { run }
}
