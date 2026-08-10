import type {
  OrchestrationInboxInput,
  OrchestrationReplyInput
} from '@yiru/runtime-protocol/contract'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { RpcContext } from '~main/runtime/rpc/core'
import { ORCHESTRATION_LEGACY_RUN_ID } from '~shared/orchestration-rpc-contract'

import { resolveRunScope } from './run-scope'

export async function handleOrchestrationReply(
  params: OrchestrationReplyInput,
  { runtime }: RpcContext
) {
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
    if (db.getFederatedDispatch(question.dispatch_id)) {
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

export function handleOrchestrationInbox(params: OrchestrationInboxInput, { runtime }: RpcContext) {
  const db = runtime.getOrchestrationDb()
  // Why: historical rows survive handle deletion, so stale selectors return an empty list.
  const messages = params.terminal
    ? db.getAllMessagesForHandle(params.terminal, params.limit)
    : db.getInbox(params.limit)
  return { messages, count: messages.length }
}
