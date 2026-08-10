import {
  ORCHESTRATION_FEDERATION_STOP_CONTRACT,
  type OrchestrationWorkerDispatchInput,
  type OrchestrationWorkerStopResult,
  type RuntimeJsonValue,
  type TerminalClose
} from '@yiru/runtime-protocol/contract'
import { syncFederatedDispatch } from '~main/runtime/orchestration/federation-sync'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { RpcContext } from '~main/runtime/rpc/core'

import { inspectWorkerTerminal, resolvePinnedFederatedServer } from './observation'

export async function handleOrchestrationWorkerStop(
  params: OrchestrationWorkerDispatchInput,
  { runtime, orchestrationMutation }: RpcContext
): Promise<OrchestrationWorkerStopResult> {
  const db = runtime.getOrchestrationDb()
  const federated = db.getFederatedDispatch(params.dispatch)
  if (federated) {
    if (!orchestrationMutation) {
      throw new OrchestrationError(
        'invalid_argument',
        'Remote worker-stop requires a durable retry request.'
      )
    }
    const server = resolvePinnedFederatedServer(runtime, federated)
    const begun = db.beginWorkerStop(params.dispatch)
    if (begun.disposition === 'already_settled') {
      return settledReceipt(params.dispatch, begun.worker.state)
    }
    try {
      const remote = (await runtime.callOrchestrationWorkerServer(
        server.environmentId,
        ORCHESTRATION_FEDERATION_STOP_CONTRACT,
        { dispatchId: params.dispatch },
        30_000,
        { orchestrationRequestId: orchestrationMutation.requestId }
      )) as RemoteStopReceipt
      if (remote.state === 'stopped') {
        const worker = db.reconcileFederatedWorkerStop(params.dispatch)
        return {
          dispatchId: params.dispatch,
          state: worker.state,
          alreadySettled: remote.alreadySettled,
          processAction: remote.processAction,
          close: remote.close
        }
      }
      if (remote.state === 'succeeded' || remote.state === 'failed') {
        db.resumeFederatedWorkerForTerminalRelay(params.dispatch)
        await syncFederatedDispatch(runtime, params.dispatch).catch(() => undefined)
        return {
          dispatchId: params.dispatch,
          state: db.getWorkerDispatch(params.dispatch)?.state ?? remote.state,
          alreadySettled: true,
          processAction: 'none'
        }
      }
      return unknownReceipt(
        params.dispatch,
        db.markWorkerStopUnknown(
          params.dispatch,
          remote.lastError ?? `The worker host returned ${remote.state}.`
        ),
        remote.processAction
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return unknownReceipt(
        params.dispatch,
        db.markWorkerStopUnknown(params.dispatch, reason),
        'unknown'
      )
    }
  }

  const begun = db.beginWorkerStop(params.dispatch)
  if (begun.disposition === 'already_settled') {
    return settledReceipt(params.dispatch, begun.worker.state)
  }
  const handle = begun.worker.agent_terminal_handle
  if (!handle) {
    return unknownReceipt(
      params.dispatch,
      db.markWorkerStopUnknown(params.dispatch, 'The Dispatch has no recorded agent terminal.'),
      'unknown'
    )
  }
  const observation = await inspectWorkerTerminal(runtime, db, params.dispatch)
  if (!observation.exact || observation.status !== 'running') {
    return unknownReceipt(
      params.dispatch,
      db.markWorkerStopUnknown(
        params.dispatch,
        `The recorded worker process is ${observation.status}; no terminal was closed.`
      ),
      'none'
    )
  }
  try {
    const close = await runtime.closeTerminal(handle)
    const worker = db.settleWorkerStop(params.dispatch)
    runtime.notifyMessageArrived(`dispatch:${params.dispatch}`, 'status')
    return {
      dispatchId: params.dispatch,
      state: worker.state,
      alreadySettled: false,
      processAction: 'closed_agent_terminal',
      close
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return unknownReceipt(
      params.dispatch,
      db.markWorkerStopUnknown(params.dispatch, reason),
      'unknown'
    )
  }
}

type RemoteStopReceipt = {
  state: string
  alreadySettled: boolean
  processAction: string
  close?: TerminalClose | RuntimeJsonValue
  lastError?: string | null
}

function settledReceipt(dispatchId: string, state: string) {
  return { dispatchId, state, alreadySettled: true, processAction: 'none' }
}

function unknownReceipt(
  dispatchId: string,
  worker: { state: string; last_error: string | null },
  processAction: string
) {
  return {
    dispatchId,
    state: worker.state,
    alreadySettled: false,
    processAction,
    lastError: worker.last_error
  }
}
