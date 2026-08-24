import { isEquivalentPaneKey } from './orchestration-db-foundation'
import { OrchestrationDbLayer11 } from './orchestration-db-layer-11'
import { OrchestrationError } from './orchestration-error'
import type {
  MessageType,
  MessagePriority,
  MessageRow,
  WorkerReportOutcome,
  FederationRelayDirection,
  FederationRelayItemRow
} from './types'

export abstract class OrchestrationDbLayer12 extends OrchestrationDbLayer11 {
  importFederatedRelayItem(params: {
    dispatchId: string
    sequence: number
    message: {
      id: string
      runId: string
      from: string
      to: string
      subject: string
      body: string
      type: MessageType
      priority: MessagePriority
      threadId?: string
      payload?: string
    }
    lifecycle:
      | { kind: 'none' }
      | { kind: 'heartbeat'; at: string }
      | {
          kind: 'worker_report'
          taskId: string
          outcome: WorkerReportOutcome
          result: string
        }
      | { kind: 'rejected'; code: string; reason: string }
  }): { message: MessageRow; duplicate: boolean } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const federated = this.getFederatedDispatch(params.dispatchId)
      if (!federated) {
        throw new OrchestrationError(
          'dispatch_not_found',
          `Federated Dispatch ${params.dispatchId} was not found.`
        )
      }
      if (params.sequence <= federated.to_home_imported_sequence) {
        const existing = this.getMessageById(params.message.id)
        if (!existing) {
          throw new OrchestrationError(
            'operation_unknown',
            `Federated relay sequence ${params.sequence} was committed without its message.`
          )
        }
        this.db.exec('COMMIT')
        return { message: existing, duplicate: true }
      }
      if (params.sequence !== federated.to_home_imported_sequence + 1) {
        throw new OrchestrationError(
          'operation_unknown',
          `Federated relay for ${params.dispatchId} is not contiguous after sequence ${federated.to_home_imported_sequence}.`
        )
      }

      let message = this.getMessageById(params.message.id)
      if (!message) {
        message = this.insertMessage(params.message)
      } else if (
        message.run_id !== params.message.runId ||
        message.to_handle !== params.message.to ||
        message.type !== params.message.type
      ) {
        throw new OrchestrationError(
          'request_mismatch',
          `Federated relay message ${params.message.id} conflicts with an existing message.`
        )
      }
      if (message.type === 'question') {
        this.registerFederatedQuestion({
          messageId: message.id,
          runId: params.message.runId,
          dispatchId: params.dispatchId
        })
      }
      if (params.lifecycle.kind === 'heartbeat') {
        this.recordHeartbeat(params.dispatchId, params.lifecycle.at)
      } else if (params.lifecycle.kind === 'worker_report') {
        const settlement = this.settleWorkerReportInTransaction({
          taskId: params.lifecycle.taskId,
          dispatchId: params.dispatchId,
          outcome: params.lifecycle.outcome,
          result: params.lifecycle.result
        })
        if (settlement.action === 'rejected') {
          message = this.convertLifecycleMessageToRejection(
            message.id,
            settlement.code,
            settlement.reason
          ) as MessageRow
        }
      } else if (params.lifecycle.kind === 'rejected') {
        message = this.convertLifecycleMessageToRejection(
          message.id,
          params.lifecycle.code,
          params.lifecycle.reason
        ) as MessageRow
      }
      this.setFederatedHomeImportSequence(params.dispatchId, params.sequence)
      this.db.exec('COMMIT')
      return { message, duplicate: false }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getRemoteQuestion(messageId: string):
    | {
        message_id: string
        dispatch_id: string
        status: 'pending' | 'answered' | 'closed'
        answer_message_id: string | null
        answer_body: string | null
      }
    | undefined {
    return this.db.prepare('SELECT * FROM remote_questions WHERE message_id = ?').get(messageId) as
      | {
          message_id: string
          dispatch_id: string
          status: 'pending' | 'answered' | 'closed'
          answer_message_id: string | null
          answer_body: string | null
        }
      | undefined
  }

  answerRemoteQuestion(params: {
    messageId: string
    dispatchId: string
    answerMessageId: string
    body: string
  }): void {
    const question = this.getRemoteQuestion(params.messageId)
    if (!question || question.dispatch_id !== params.dispatchId) {
      throw new OrchestrationError(
        'question_not_found',
        `Remote Question ${params.messageId} was not found.`
      )
    }
    if (question.status === 'answered') {
      if (
        question.answer_message_id !== params.answerMessageId ||
        question.answer_body !== params.body
      ) {
        throw new OrchestrationError(
          'answer_conflict',
          `Remote Question ${params.messageId} already has a different answer.`
        )
      }
      return
    }
    this.db
      .prepare(
        `UPDATE remote_questions
         SET status = 'answered', answer_message_id = ?, answer_body = ?,
             answered_at = datetime('now')
         WHERE message_id = ? AND status = 'pending'`
      )
      .run(params.answerMessageId, params.body, params.messageId)
  }

  setRemoteWorkerImportSequence(dispatchId: string, sequence: number): void {
    this.db
      .prepare(
        `UPDATE remote_dispatch_attachments
         SET to_worker_imported_sequence = ?, updated_at = datetime('now')
         WHERE dispatch_id = ? AND to_worker_imported_sequence < ?`
      )
      .run(sequence, dispatchId, sequence)
  }

  registerFederatedQuestion(params: {
    messageId: string
    runId: string
    dispatchId: string
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO question_threads (
           message_id, run_id, dispatch_id, asker_handle
         ) VALUES (?, ?, ?, ?)`
      )
      .run(params.messageId, params.runId, params.dispatchId, `dispatch:${params.dispatchId}`)
  }

  protected getFederationRelayItem(
    dispatchId: string,
    direction: FederationRelayDirection,
    sequence: number
  ): FederationRelayItemRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM federation_relay_items
         WHERE dispatch_id = ? AND direction = ? AND sequence = ?`
      )
      .get(dispatchId, direction, sequence) as FederationRelayItemRow | undefined
  }

  protected settleRemoteAttachmentInRelayTransaction(
    dispatchId: string,
    outcome: WorkerReportOutcome | undefined
  ): void {
    if (!outcome) {
      return
    }
    this.db
      .prepare(
        `UPDATE remote_dispatch_attachments
         SET state = ?, stage = 'worker_report_queued', capability_hash = NULL,
             updated_at = datetime('now')
         WHERE dispatch_id = ? AND state = 'ready'`
      )
      .run(outcome === 'succeeded' ? 'succeeded' : 'failed', dispatchId)
  }

  isDispatchProcessCurrent(params: {
    dispatchId: string
    paneKey: string | null
    processIncarnation: string | null
  }): boolean {
    const dispatch = this.getDispatchContextById(params.dispatchId)
    return Boolean(
      dispatch?.assignee_pane_key &&
      params.paneKey &&
      isEquivalentPaneKey(dispatch.assignee_pane_key, params.paneKey) &&
      dispatch.process_incarnation &&
      params.processIncarnation === dispatch.process_incarnation
    )
  }
}
