import type {
  OrchestrationFederationDispatchInput,
  OrchestrationFederationOutputReadInput,
  OrchestrationFederationReadInput,
  OrchestrationFederationShowResult
} from '@yiru/runtime-protocol/contract'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { RemoteDispatchAttachmentRow } from '~main/runtime/orchestration/types'
import type { RpcContext, RpcMethod } from '~main/runtime/rpc/core'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import { readExactWorkerOutput } from '../worker/output'

export async function handleOrchestrationFederationShow(
  params: OrchestrationFederationDispatchInput,
  { runtime, authenticatedCallerFingerprint }: RpcContext
): Promise<OrchestrationFederationShowResult> {
  const attachment = requireHomeAttachment(
    runtime,
    params.dispatchId,
    authenticatedCallerFingerprint
  )
  const observation = await inspectRemoteAttachment(runtime, params.dispatchId)
  return {
    dispatchId: params.dispatchId,
    runtimeEpoch: runtime.getRuntimeId(),
    attachment: exposeRemoteAttachment(attachment),
    terminal: observation.exact ? observation.terminal : null,
    observation: { status: observation.status, exactWorker: observation.exact }
  }
}

export async function handleOrchestrationFederationRead(
  params: OrchestrationFederationReadInput,
  { runtime, authenticatedCallerFingerprint }: RpcContext
) {
  requireHomeAttachment(runtime, params.dispatchId, authenticatedCallerFingerprint)
  const observation = await inspectRemoteAttachment(runtime, params.dispatchId)
  if (!observation.exact || !observation.terminal || observation.status !== 'running') {
    throw new OrchestrationError(
      'worker_identity_changed',
      `Remote Dispatch ${params.dispatchId} no longer resolves to its exact process.`
    )
  }
  return {
    dispatchId: params.dispatchId,
    runtimeEpoch: runtime.getRuntimeId(),
    terminal: await runtime.readTerminal(observation.terminal.handle, {
      cursor: params.cursor,
      limit: params.limit
    })
  }
}

export async function handleOrchestrationFederationReadOutput(
  params: OrchestrationFederationOutputReadInput,
  { runtime, authenticatedCallerFingerprint }: RpcContext
) {
  const attachment = requireHomeAttachment(
    runtime,
    params.dispatchId,
    authenticatedCallerFingerprint
  )
  const observation = await inspectRemoteAttachment(runtime, params.dispatchId)
  if (!observation.exact || !observation.terminal) {
    throw new OrchestrationError(
      'worker_identity_changed',
      `Remote Dispatch ${params.dispatchId} no longer resolves to its exact process.`
    )
  }
  const output = await readExactWorkerOutput({
    runtime,
    dispatchId: params.dispatchId,
    terminalHandle: observation.terminal.handle,
    workerState: attachment.state,
    terminalStatus: observation.status === 'exited' ? 'exited' : 'running',
    attachedAt: attachment.created_at,
    source: params.source,
    cursor: params.cursor,
    limit: params.limit
  })
  const afterRead = await inspectRemoteAttachment(runtime, params.dispatchId)
  if (!afterRead.exact) {
    throw new OrchestrationError(
      'worker_identity_changed',
      `Remote Dispatch ${params.dispatchId} changed process while output was read.`
    )
  }
  return { dispatchId: params.dispatchId, runtimeEpoch: runtime.getRuntimeId(), output }
}

export async function handleOrchestrationFederationStop(
  params: OrchestrationFederationDispatchInput,
  { runtime, authenticatedCallerFingerprint }: RpcContext
) {
  requireHomeAttachment(runtime, params.dispatchId, authenticatedCallerFingerprint)
  const db = runtime.getOrchestrationDb()
  const begun = db.beginRemoteAttachmentStop(params.dispatchId)
  if (['succeeded', 'failed', 'stopped', 'abandoned'].includes(begun.state)) {
    return {
      dispatchId: params.dispatchId,
      state: begun.state,
      alreadySettled: true,
      processAction: 'none'
    }
  }
  const observation = await inspectRemoteAttachment(runtime, params.dispatchId)
  if (!observation.exact || !observation.terminal) {
    const attachment = db.markRemoteAttachmentStopUnknown(
      params.dispatchId,
      `The recorded worker process is ${observation.status}; no terminal was closed.`
    )
    return {
      dispatchId: params.dispatchId,
      state: attachment.state,
      alreadySettled: false,
      processAction: 'none',
      lastError: attachment.last_error
    }
  }
  try {
    const close = await runtime.closeTerminal(observation.terminal.handle)
    const attachment = db.settleRemoteAttachmentStop(params.dispatchId)
    return {
      dispatchId: params.dispatchId,
      state: attachment.state,
      alreadySettled: false,
      processAction: 'closed_agent_terminal',
      close
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const attachment = db.markRemoteAttachmentStopUnknown(params.dispatchId, reason)
    return {
      dispatchId: params.dispatchId,
      state: attachment.state,
      alreadySettled: false,
      processAction: 'unknown',
      lastError: reason
    }
  }
}

function requireHomeAttachment(
  runtime: YiruRuntimeService,
  dispatchId: string,
  callerFingerprint: string | undefined
): RemoteDispatchAttachmentRow {
  const attachment = runtime.getOrchestrationDb().getRemoteDispatchAttachment(dispatchId)
  if (!attachment || attachment.home_peer_fingerprint !== callerFingerprint) {
    throw new OrchestrationError(
      'dispatch_not_found',
      `Remote Dispatch ${dispatchId} was not found for this Run home.`
    )
  }
  return attachment
}

async function inspectRemoteAttachment(runtime: YiruRuntimeService, dispatchId: string) {
  const db = runtime.getOrchestrationDb()
  const attachment = db.getRemoteDispatchAttachment(dispatchId)
  if (!attachment?.terminal_handle) {
    return { terminal: null, exact: false, status: 'unattached' as const }
  }
  const terminal = await runtime.showTerminal(attachment.terminal_handle).catch(() => null)
  if (!terminal) {
    return { terminal: null, exact: false, status: 'missing' as const }
  }
  const exact = db.isRemoteAttachmentProcessCurrent({
    dispatchId,
    paneKey: runtime.getTerminalPaneKey(attachment.terminal_handle),
    processIncarnation: runtime.getTerminalProcessIncarnation(attachment.terminal_handle)
  })
  return {
    terminal,
    exact,
    status: exact
      ? terminal.connected === false
        ? ('exited' as const)
        : ('running' as const)
      : ('identity_changed' as const)
  }
}

function exposeRemoteAttachment(attachment: RemoteDispatchAttachmentRow) {
  return {
    ...attachment,
    effects: JSON.parse(attachment.effects),
    residualResources: JSON.parse(attachment.residual_resources)
  }
}

// Why: all 4 leaves this file used to legacy-register are retired now.
// `federationShow`/`federationRead`/`federationReadOutput` went in slice 84
// Part A (no envelope, so a real `RuntimeMethodContract` alone was enough).
// `federationStop` went in slice 84 Part B — its caller (`handleOrchestrationWorkerStop`)
// now passes `ORCHESTRATION_FEDERATION_STOP_CONTRACT`, and its
// `orchestrationRequestId` envelope rides the oRPC tunnel as headers
// (`environment-orpc-unary-client.ts`'s `buildRuntimeOrpcCallHeaders`) instead
// of forcing the bare-envelope path. All 4 reach this same handler through the
// direct-wired oRPC route (`router-direct/orchestration.ts`) once the peer's
// oRPC tunnel is confirmed, falling back to the bare envelope for an older
// peer that still speaks the legacy dispatcher.
export const ORCHESTRATION_FEDERATION_CONTROL_METHODS: RpcMethod[] = []
