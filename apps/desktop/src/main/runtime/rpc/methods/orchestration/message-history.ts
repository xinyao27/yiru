import { z } from 'zod'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import { defineMethod, type RpcMethod } from '~main/runtime/rpc/core'
import { ORCHESTRATION_LEGACY_RUN_ID } from '~shared/orchestration-rpc-contract'
import {
  OptionalFiniteNumber,
  OptionalString,
  requiredString
} from '~shared/runtime-method-contracts/runtime-method-params'

import { resolveRunScope } from './run-scope'

const ReplyParams = z.object({
  id: requiredString('Missing --id'),
  body: requiredString('Missing --body'),
  from: OptionalString,
  run: OptionalString
})

const InboxParams = z.object({
  limit: OptionalFiniteNumber,
  // Why: filters the inbox to a handle so inbox and check --all give agreeing results (design doc §3.3).
  terminal: OptionalString
})

export const ORCHESTRATION_MESSAGE_HISTORY_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.reply',
    params: ReplyParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const original = db.getMessageById(params.id)
      if (!original) {
        throw new Error(`Message not found: ${params.id}`)
      }
      if (original.run_id === ORCHESTRATION_LEGACY_RUN_ID) {
        throw new OrchestrationError(
          'legacy_read_only',
          'Legacy orchestration messages are inspect-only; no reply was applied.',
          { effectsApplied: false }
        )
      }

      const question = db.getQuestion(params.id)
      if (question) {
        const run = resolveRunScope(runtime, {
          runId: params.run ?? question.run_id,
          callerTerminalHandle: params.from,
          requireCurrentConsumer: true
        })
        const answered = db.answerQuestion({
          messageId: question.message_id,
          runId: run.id,
          consumerGeneration: run.consumer_generation,
          body: params.body
        })
        const federated = db.getFederatedDispatch(question.dispatch_id)
        if (federated) {
          db.enqueueFederationRelay({
            dispatchId: question.dispatch_id,
            direction: 'to_worker',
            kind: 'reply',
            payload: JSON.stringify({
              questionId: question.message_id,
              answerMessageId: answered.message.id,
              body: params.body
            })
          })
          runtime.ensureOrchestrationFederationRelay(run.id)
        } else {
          runtime.notifyMessageArrived(`dispatch:${question.dispatch_id}`, 'status')
        }
        return {
          message: answered.message,
          question: answered.question,
          duplicate: answered.duplicate
        }
      }

      db.markAsRead([original.id])

      const reply = db.insertMessage({
        from: params.from ?? original.to_handle,
        to: original.from_handle,
        subject: `Re: ${original.subject}`,
        body: params.body,
        threadId: original.thread_id ?? original.id,
        runId: original.run_id
      })

      runtime.notifyMessageArrived(original.from_handle, reply.type)
      return { message: reply }
    }
  }),
  defineMethod({
    name: 'orchestration.inbox',
    params: InboxParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      // Why: stale/unknown handles return empty rather than error — historical rows survive handle deletion (design doc §3.3).
      const messages = params.terminal
        ? db.getAllMessagesForHandle(params.terminal, params.limit)
        : db.getInbox(params.limit)
      return { messages, count: messages.length }
    }
  })
]
