import type {
  OrchestrationWorkerAbandonResult,
  OrchestrationWorkerDispatchInput,
  OrchestrationWorkerShowResult
} from '@yiru/runtime-protocol/contract'
import { syncFederatedDispatch } from '~main/runtime/orchestration/federation-sync'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { RpcContext } from '~main/runtime/rpc/core'

import {
  callFederatedWorkerShow,
  exposeWorker,
  inspectWorkerTerminal,
  resolvePinnedFederatedServer
} from './observation'

export async function handleOrchestrationWorkerShow(
  params: OrchestrationWorkerDispatchInput,
  { runtime }: RpcContext
): Promise<OrchestrationWorkerShowResult> {
  const db = runtime.getOrchestrationDb()
  const dispatch = db.getDispatchContextById(params.dispatch)
  let worker = db.getWorkerDispatch(params.dispatch)
  if (!dispatch || !worker) {
    throw new OrchestrationError(
      'dispatch_not_found',
      `Worker Dispatch ${params.dispatch} was not found.`
    )
  }
  const federated = db.getFederatedDispatch(params.dispatch)
  if (federated) {
    const server = resolvePinnedFederatedServer(runtime, federated)
    runtime.ensureOrchestrationFederationRelay(dispatch.run_id)
    const remote = await callFederatedWorkerShow(runtime, federated)
    const attachment = remote.attachment
    worker = db.updateWorkerSetupEvidence({
      dispatchId: params.dispatch,
      setupState: attachment.setup_state,
      effects: attachment.effects
    }).worker
    if (
      attachment.state === 'succeeded' ||
      (attachment.state === 'failed' && attachment.stage === 'worker_report_queued')
    ) {
      await syncFederatedDispatch(runtime, params.dispatch).catch(() => undefined)
    } else if (
      attachment.state === 'stopped' &&
      ['stopping', 'stop_unknown'].includes(worker.state)
    ) {
      worker = db.reconcileFederatedWorkerStop(params.dispatch)
    } else if (['ready', 'failed', 'stopped', 'start_unknown'].includes(attachment.state)) {
      worker = db.reconcileFederatedWorkerStart({
        dispatchId: params.dispatch,
        state: attachment.state as 'ready' | 'failed' | 'stopped' | 'start_unknown',
        stage: attachment.stage,
        lastError: attachment.last_error,
        worktreeId: attachment.worktree_id,
        terminalHandle: attachment.terminal_handle,
        setupState: attachment.setup_state,
        effects: attachment.effects,
        residualResources: attachment.residualResources
      })
      if (attachment.state === 'ready' && attachment.worktree_id && attachment.terminal_handle) {
        db.updateFederatedDispatchResources({
          dispatchId: params.dispatch,
          remoteRuntimeEpoch: remote.runtimeEpoch,
          worktreeId: attachment.worktree_id,
          terminalHandle: attachment.terminal_handle
        })
      }
    }
    worker = db.getWorkerDispatch(params.dispatch)
    if (!worker) {
      throw new OrchestrationError(
        'dispatch_not_found',
        `Worker Dispatch ${params.dispatch} was not found after remote reconciliation.`
      )
    }
    return {
      dispatch: db.getDispatchContextById(params.dispatch) ?? null,
      worker: exposeWorker(worker),
      server: { environmentId: server.environmentId, name: server.name },
      remoteRuntimeEpoch: remote.runtimeEpoch,
      terminal: remote.terminal,
      observation: remote.observation
    }
  }
  if (worker.runtime_epoch && worker.runtime_epoch !== runtime.getRuntimeId()) {
    if (worker.state === 'starting') {
      worker = db.markWorkerStartUnknown(
        params.dispatch,
        worker.stage,
        'The runtime restarted before worker-start reached a terminal receipt.'
      )
    } else if (worker.state === 'stopping') {
      worker = db.markWorkerStopUnknown(
        params.dispatch,
        'The runtime restarted before worker-stop reached a terminal receipt.'
      )
    }
  }
  const observation = await inspectWorkerTerminal(runtime, db, params.dispatch)
  return {
    dispatch,
    worker: exposeWorker(worker),
    terminal: observation.exact ? observation.terminal : null,
    observation: { status: observation.status, exactWorker: observation.exact }
  }
}

export function handleOrchestrationWorkerAbandon(
  params: OrchestrationWorkerDispatchInput,
  { runtime }: RpcContext
): OrchestrationWorkerAbandonResult {
  const abandoned = runtime.getOrchestrationDb().abandonWorkerDispatch(params.dispatch)
  const worker = abandoned.worker
  if (abandoned.disposition === 'abandoned') {
    runtime.notifyMessageArrived(`dispatch:${params.dispatch}`, 'status')
  }
  return {
    dispatchId: params.dispatch,
    state: worker.state,
    alreadySettled: abandoned.disposition !== 'abandoned',
    stale: abandoned.disposition === 'stale',
    processAction: 'none',
    warning:
      abandoned.disposition === 'stale'
        ? 'The Dispatch is no longer current; no state or process changed.'
        : 'Possibly-live resources were retained; no process was stopped or deleted.',
    residualResources: JSON.parse(worker.residual_resources)
  }
}
