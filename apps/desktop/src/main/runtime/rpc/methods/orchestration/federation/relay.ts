import { ORCHESTRATION_FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION } from '@yiru/runtime-protocol/capabilities'
import type {
  OrchestrationFederationAckInput,
  OrchestrationFederationImportInput,
  OrchestrationFederationPullInput
} from '@yiru/runtime-protocol/contract'
import { importFederatedControlMessage } from '~main/runtime/orchestration/federation-control-message'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { RpcContext, RpcMethod } from '~main/runtime/rpc/core'

export function handleOrchestrationFederationPull(
  params: OrchestrationFederationPullInput,
  { runtime, authenticatedCallerFingerprint }: RpcContext
) {
  requireHomeAttachment(runtime, params.dispatchId, authenticatedCallerFingerprint)
  return {
    dispatchId: params.dispatchId,
    runtimeEpoch: runtime.getRuntimeId(),
    items: runtime.getOrchestrationDb().listFederationRelay({
      dispatchId: params.dispatchId,
      direction: 'to_home',
      afterSequence: params.afterSequence ?? 0,
      limit: params.limit
    })
  }
}

export function handleOrchestrationFederationAck(
  params: OrchestrationFederationAckInput,
  { runtime, authenticatedCallerFingerprint }: RpcContext
) {
  requireHomeAttachment(runtime, params.dispatchId, authenticatedCallerFingerprint)
  runtime.getOrchestrationDb().acknowledgeFederationRelay({
    dispatchId: params.dispatchId,
    direction: 'to_home',
    throughSequence: params.throughSequence
  })
  return { dispatchId: params.dispatchId, acknowledgedThrough: params.throughSequence }
}

export function handleOrchestrationFederationImport(
  params: OrchestrationFederationImportInput,
  { runtime, authenticatedCallerFingerprint }: RpcContext
) {
  const db = runtime.getOrchestrationDb()
  const attachment = requireHomeAttachment(
    runtime,
    params.dispatchId,
    authenticatedCallerFingerprint
  )
  let cursor = attachment.to_worker_imported_sequence
  let imported = 0
  for (const item of params.items) {
    if (item.dispatch_id !== params.dispatchId || item.sequence > cursor + 1) {
      throw new OrchestrationError(
        'operation_unknown',
        `Home relay for ${params.dispatchId} is not contiguous after sequence ${cursor}.`
      )
    }
    if (item.sequence <= cursor) {
      continue
    }
    const currentAttachment = requireHomeAttachment(
      runtime,
      params.dispatchId,
      authenticatedCallerFingerprint
    )
    if (currentAttachment.state !== 'ready') {
      throw new OrchestrationError(
        'dispatch_inactive',
        `Remote Dispatch ${params.dispatchId} is not active.`
      )
    }
    if (item.kind === 'reply') {
      const reply = parseFederatedReply(item.payload)
      db.answerRemoteQuestion({
        messageId: reply.questionId,
        dispatchId: params.dispatchId,
        answerMessageId: reply.answerMessageId,
        body: reply.body
      })
      runtime.notifyMessageArrived(`dispatch:${params.dispatchId}`, 'status')
    } else if (item.kind === 'control_message') {
      if (
        currentAttachment.protocol_version < ORCHESTRATION_FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION
      ) {
        throw new OrchestrationError(
          'capability_unsupported',
          `Remote Dispatch ${params.dispatchId} does not support coordinator control mail.`
        )
      }
      const controlMessage = importFederatedControlMessage(db, {
        dispatchId: params.dispatchId,
        messageId: item.message_id,
        payload: item.payload
      })
      imported += controlMessage.imported ? 1 : 0
      if (controlMessage.imported) {
        runtime.notifyMessageArrived(`dispatch:${params.dispatchId}`, controlMessage.type)
      }
    } else {
      throw new OrchestrationError(
        'invalid_argument',
        `Federated worker relay kind ${item.kind} is not supported.`
      )
    }
    cursor = item.sequence
    db.setRemoteWorkerImportSequence(params.dispatchId, cursor)
  }
  return { dispatchId: params.dispatchId, acknowledgedThrough: cursor, imported }
}

function requireHomeAttachment(
  runtime: RpcContext['runtime'],
  dispatchId: string,
  callerFingerprint: string | undefined
) {
  const attachment = runtime.getOrchestrationDb().getRemoteDispatchAttachment(dispatchId)
  if (!attachment || attachment.home_peer_fingerprint !== callerFingerprint) {
    throw new OrchestrationError(
      'dispatch_not_found',
      `Remote Dispatch ${dispatchId} was not found for this Run home.`
    )
  }
  return attachment
}

function parseFederatedReply(payload: string): {
  questionId: string
  answerMessageId: string
  body: string
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    throw new OrchestrationError('invalid_argument', 'Federated reply payload is invalid JSON.')
  }
  const reply = parsed as Record<string, unknown> | null
  if (
    !reply ||
    typeof reply.questionId !== 'string' ||
    typeof reply.answerMessageId !== 'string' ||
    typeof reply.body !== 'string'
  ) {
    throw new OrchestrationError('invalid_argument', 'Federated reply payload is incomplete.')
  }
  return {
    questionId: reply.questionId,
    answerMessageId: reply.answerMessageId,
    body: reply.body
  }
}

// Why: all 3 leaves this file used to legacy-register are retired now.
// `federationPull` went in slice 84 Part A (no envelope, so a real
// `RuntimeMethodContract` alone was enough). `federationAck`/
// `federationImport` went in slice 84 Part B — their callers
// (`syncFederatedDispatch`) now pass an `ORCHESTRATION_FEDERATION_*_CONTRACT`
// object, and their `orchestrationRequestId` envelope rides the oRPC tunnel as
// headers (`environment-orpc-unary-client.ts`'s `buildRuntimeOrpcCallHeaders`)
// instead of forcing the bare-envelope path. All 3 reach this same handler
// through the direct-wired oRPC route (`router-direct/orchestration.ts`) once
// the peer's oRPC tunnel is confirmed, falling back to the bare envelope for
// an older peer that still speaks the legacy dispatcher.
export const ORCHESTRATION_FEDERATION_RELAY_METHODS: RpcMethod[] = []
