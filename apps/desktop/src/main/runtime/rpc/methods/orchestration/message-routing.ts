import { OrchestrationError } from '../../../orchestration/orchestration-error'
import type { RunRow } from '../../../orchestration/types'
import type { YiruRuntimeService } from '../../../yiru-runtime'

export function parseRemoteWorkerPayload(payload: string | undefined): Record<string, unknown> {
  if (!payload) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(payload)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    throw new OrchestrationError('invalid_argument', 'Message payload must be valid JSON.')
  }
}

export function resolveMessageRun(
  runtime: YiruRuntimeService,
  params: {
    from?: string
    senderPaneKey?: string
    to?: string
    runId?: string
    payload?: string
  }
): { run: RunRow | undefined; dispatchId: string | undefined } {
  const db = runtime.getOrchestrationDb()
  let dispatchId: string | undefined
  if (params.payload) {
    try {
      const payload: unknown = JSON.parse(params.payload)
      if (
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        typeof (payload as { dispatchId?: unknown }).dispatchId === 'string'
      ) {
        dispatchId = (payload as { dispatchId: string }).dispatchId
      }
    } catch {
      // Lifecycle validation owns malformed payload errors; routing simply cannot derive a Dispatch.
    }
  }
  if (!dispatchId && params.to?.startsWith('dispatch:')) {
    dispatchId = params.to.slice('dispatch:'.length)
  }

  const dispatch = dispatchId
    ? db.getDispatchContextById(dispatchId)
    : params.from
      ? db.getActiveDispatchForIdentity(params.from, params.senderPaneKey)
      : undefined
  if (params.to?.startsWith('dispatch:') && !dispatch) {
    throw new OrchestrationError(
      'dispatch_not_found',
      `Dispatch ${dispatchId ?? ''} was not found.`
    )
  }
  const targetRunId = params.to?.startsWith('run:') ? params.to.slice('run:'.length) : undefined
  const resolvedRunId = params.runId ?? targetRunId ?? dispatch?.run_id
  let run = resolvedRunId ? db.getRun(resolvedRunId) : undefined

  if (!run && params.from) {
    const paneKey = params.senderPaneKey ?? runtime.getTerminalPaneKey(params.from)
    run = paneKey ? db.getCurrentRunForPane(paneKey) : undefined
  }
  if (resolvedRunId && (!run || run.legacy === 1)) {
    throw new OrchestrationError('run_not_found', `Run ${resolvedRunId} was not found.`)
  }
  if (run && targetRunId && targetRunId !== run.id) {
    throw new OrchestrationError('run_not_found', `Run ${targetRunId} was not found.`)
  }
  if (run && dispatch && dispatch.run_id !== run.id) {
    throw new OrchestrationError(
      'dispatch_run_mismatch',
      `Dispatch ${dispatch.id} belongs to Run ${dispatch.run_id}, not ${run.id}.`
    )
  }
  return { run, dispatchId: dispatch?.id ?? dispatchId }
}

export function rejectFederatedExplicitTarget(params: { to?: string; run?: string }): void {
  if (params.to || params.run) {
    throw new OrchestrationError(
      'invalid_argument',
      'Federated Dispatch messages route to their Run home; omit --to and --run.'
    )
  }
}
