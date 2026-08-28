import type { OrchestrationWorkerStartResult } from '@yiru/runtime-protocol/contract'
import type { OrchestrationDb } from '~main/runtime/orchestration/db'

import { isUnknownWorkerStartOutcome, type WorkerSetupReceipt } from './topology'

export function failWorkerStartWithReceipt(args: {
  db: OrchestrationDb
  runId: string
  taskId: string
  dispatchId: string
  failedStage: string
  error: unknown
  setup: WorkerSetupReceipt
}): OrchestrationWorkerStartResult {
  const reason = args.error instanceof Error ? args.error.message : String(args.error)
  const unknown = isUnknownWorkerStartOutcome(args.error, args.failedStage)
  const worker = unknown
    ? args.db.markWorkerStartUnknown(args.dispatchId, args.failedStage, reason)
    : args.db.failWorkerStart(args.dispatchId, args.failedStage, reason)
  return {
    runId: args.runId,
    taskId: args.taskId,
    dispatchId: args.dispatchId,
    state: worker.state === 'start_unknown' ? 'outcome_unknown' : worker.state,
    stage: worker.stage,
    failedStage: args.failedStage,
    lastError: reason,
    setup: args.setup,
    effects: JSON.parse(worker.effects),
    residualResources: JSON.parse(worker.residual_resources),
    ...(unknown
      ? {
          nextCommands: [
            `yiru orchestration worker-show --dispatch ${args.dispatchId} --json`,
            `yiru orchestration worker-abandon --dispatch ${args.dispatchId} --json`
          ]
        }
      : {})
  }
}
