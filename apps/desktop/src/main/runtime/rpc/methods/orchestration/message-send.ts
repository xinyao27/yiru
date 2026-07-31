import { ORCHESTRATION_FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION } from '@yiru/runtime-protocol/capabilities'
import type { MessagePriority, MessageType } from '~main/runtime/orchestration/db'
import { encodeFederatedControlMessage } from '~main/runtime/orchestration/federation-control-message'
import { isGroupAddress, resolveGroupAddress } from '~main/runtime/orchestration/groups'
import { reconcileLifecycleMessage } from '~main/runtime/orchestration/lifecycle-reconciliation'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import { defineMethod, type RpcMethod } from '~main/runtime/rpc/core'
import { orchestrationSkillRecoveryData } from '~shared/orchestration-rpc-contract'

import {
  parseRemoteWorkerPayload,
  rejectFederatedExplicitTarget,
  resolveMessageRun
} from './message-routing'
import { MessageSendParams } from './message-send-contract'

export const ORCHESTRATION_MESSAGE_SEND_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.send',
    params: MessageSendParams,
    handler: async (params, { runtime, orchestrationCapability }) => {
      const db = runtime.getOrchestrationDb()
      const from = params.from ?? 'unknown'
      // Why: caller-supplied pane fields are only compatibility metadata; lifecycle authority uses the runtime-observed pane plus capability.
      const senderPaneKey = runtime.getTerminalPaneKey(from) ?? undefined
      const remoteAttachment = senderPaneKey
        ? db.findActiveRemoteAttachmentForPane(senderPaneKey)
        : undefined
      if (remoteAttachment) {
        rejectFederatedExplicitTarget(params)
        const processIncarnation = runtime.getTerminalProcessIncarnation(from)
        if (
          !db.verifyRemoteAttachmentAuthority({
            dispatchId: remoteAttachment.dispatch_id,
            capability: orchestrationCapability,
            paneKey: senderPaneKey ?? null,
            processIncarnation
          })
        ) {
          throw new OrchestrationError(
            'dispatch_capability_invalid',
            'The remote Dispatch capability or exact worker process is invalid.'
          )
        }
        const type = (params.type ?? 'status') as MessageType
        const payload = parseRemoteWorkerPayload(params.payload)
        if (
          typeof payload.dispatchId === 'string' &&
          payload.dispatchId !== remoteAttachment.dispatch_id
        ) {
          throw new OrchestrationError(
            'dispatch_inactive',
            `Dispatch ${payload.dispatchId} is not the active remote Dispatch for this pane.`
          )
        }
        const outcome =
          type === 'worker_done' &&
          (payload.outcome === 'succeeded' || payload.outcome === 'failed')
            ? payload.outcome
            : undefined
        if (type === 'worker_done' && !outcome) {
          throw new OrchestrationError(
            'invalid_argument',
            'Remote worker_done requires outcome=succeeded|failed.'
          )
        }
        const relay = db.enqueueFederationRelay({
          dispatchId: remoteAttachment.dispatch_id,
          direction: 'to_home',
          kind: type,
          payload: JSON.stringify({
            from,
            subject: params.subject,
            body: params.body ?? '',
            type,
            priority: params.priority ?? 'normal',
            threadId: params.threadId ?? null,
            payload: params.payload ?? null
          }),
          settleRemoteOutcome: outcome
        })
        return {
          relay: {
            messageId: relay.message_id,
            sequence: relay.sequence,
            dispatchId: relay.dispatch_id,
            destination: 'run_home',
            accepted: true
          },
          ...(outcome
            ? { lifecycle: { action: outcome === 'succeeded' ? 'completed' : 'failed' } }
            : {})
        }
      }
      const routing = resolveMessageRun(runtime, {
        from,
        senderPaneKey,
        to: params.to,
        runId: params.run,
        payload: params.payload
      })
      if (params.to?.startsWith('task:')) {
        throw new OrchestrationError(
          'invalid_argument',
          'Task recipients are intentionally unsupported; use run:<id> or dispatch:<id>.'
        )
      }
      let to = params.to
      if (
        routing.run &&
        (!to ||
          ((params.type === 'worker_done' || params.type === 'heartbeat') && routing.dispatchId))
      ) {
        to = `run:${routing.run.id}`
      }
      if (!to) {
        throw new OrchestrationError(
          'run_required',
          'No recipient or active Dispatch Run could be resolved. No effects were applied.',
          orchestrationSkillRecoveryData()
        )
      }

      if (!isGroupAddress(to)) {
        const federatedDispatchId = routing.dispatchId
        const federatedTarget =
          federatedDispatchId && to === `dispatch:${federatedDispatchId}`
            ? db.getFederatedDispatch(federatedDispatchId)
            : undefined
        if (federatedTarget && federatedDispatchId) {
          const dispatchId = federatedDispatchId
          if (
            federatedTarget.protocol_version <
            ORCHESTRATION_FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION
          ) {
            throw new OrchestrationError(
              'capability_unsupported',
              `Federated Dispatch ${dispatchId} does not support coordinator control mail; start a fresh worker after updating its Yiru server.`
            )
          }
          if (db.getWorkerDispatch(dispatchId)?.state !== 'ready') {
            throw new OrchestrationError(
              'dispatch_inactive',
              `Federated Dispatch ${dispatchId} is not active.`
            )
          }
          if (params.type === 'worker_done' || params.type === 'heartbeat') {
            throw new OrchestrationError(
              'invalid_argument',
              'Coordinator-to-worker control mail cannot report worker lifecycle.'
            )
          }
          const relay = db.enqueueFederationRelay({
            dispatchId,
            direction: 'to_worker',
            kind: 'control_message',
            payload: encodeFederatedControlMessage({
              from,
              subject: params.subject,
              body: params.body ?? '',
              type: (params.type ?? 'status') as MessageType,
              priority: (params.priority ?? 'normal') as MessagePriority,
              threadId: params.threadId ?? null,
              payload: params.payload ?? null
            })
          })
          runtime.ensureOrchestrationFederationRelay(routing.run?.id)
          return {
            relay: {
              messageId: relay.message_id,
              sequence: relay.sequence,
              dispatchId: relay.dispatch_id,
              destination: 'worker',
              accepted: true
            }
          }
        }
        // Point-to-point — existing single-recipient behavior
        const msg = db.insertMessage({
          from,
          to,
          subject: params.subject,
          body: params.body,
          type: params.type as MessageType,
          priority: params.priority as MessagePriority,
          threadId: params.threadId,
          payload: params.payload,
          senderPaneKey,
          runId: routing.run?.id
        })
        const dispatch = routing.dispatchId
          ? db.getDispatchContextById(routing.dispatchId)
          : undefined
        if ((msg.type === 'worker_done' || msg.type === 'heartbeat') && dispatch?.capability_hash) {
          const authority = db.verifyDispatchCapability({
            dispatchId: dispatch.id,
            capability: orchestrationCapability,
            paneKey: senderPaneKey,
            processIncarnation: runtime.getTerminalProcessIncarnation(from) ?? undefined
          })
          if (!authority.valid) {
            const rejection =
              db.convertLifecycleMessageToRejection(
                msg.id,
                'dispatch_capability_invalid',
                authority.reason
              ) ?? msg
            runtime.notifyMessageArrived(to, rejection.type)
            return {
              message: rejection,
              lifecycle: {
                action: 'rejected',
                code: 'dispatch_capability_invalid',
                reason: authority.reason
              }
            }
          }
        }
        // Why: reconcile releases the dispatch lock before waking recipients, else a woken coordinator re-dispatches while the lock is still held.
        if (msg.type === 'worker_done' || msg.type === 'heartbeat') {
          const reconciled = reconcileLifecycleMessage(db, msg)
          // Why: a suppressed message is already read, so skip the notify that would wake a check --wait waiter to an empty result.
          if (reconciled.action === 'suppressed') {
            return { message: msg }
          }
          if (reconciled.action === 'rejected') {
            const rejection = db.getMessageById(msg.id) ?? msg
            runtime.notifyMessageArrived(to, rejection.type)
            return { message: rejection, lifecycle: reconciled }
          }
        }
        runtime.notifyMessageArrived(to, msg.type)
        return { message: msg }
      }

      // Why: fan out one message per recipient (independent read-tracking) but share a thread_id for correlation (Section 4.5).
      const { terminals } = await runtime.listTerminals()
      const handles = resolveGroupAddress(to, from, terminals, (handle: string) =>
        runtime.getAgentStatusForHandle(handle)
      )

      if (handles.length === 0) {
        throw new Error(`No recipients resolved for group address: ${to}`)
      }

      const threadId = params.threadId ?? `thread_${Date.now()}`
      const messages = handles.map((handle) =>
        db.insertMessage({
          from,
          to: handle,
          subject: params.subject,
          body: params.body,
          type: params.type as MessageType,
          priority: params.priority as MessagePriority,
          threadId,
          payload: params.payload,
          senderPaneKey,
          runId: routing.run?.id
        })
      )
      for (const message of messages) {
        runtime.notifyMessageArrived(message.to_handle, message.type)
      }

      return { messages, recipients: handles.length }
    }
  })
]
