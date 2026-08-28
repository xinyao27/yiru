import {
  exposeMessageTimestamps,
  exposeMessageListTimestamps,
  exposeQuestionTimestamps
} from './orchestration-db-foundation'
import { OrchestrationDbLayer4 } from './orchestration-db-layer-4'
import { OrchestrationError } from './orchestration-error'
import type { MessageType, MessageRow, QuestionRow } from './types'

export abstract class OrchestrationDbLayer5 extends OrchestrationDbLayer4 {
  // Why: delivered_at IS NULL filter — push-on-idle delivers each row at most once; read (set only by check) wouldn't prevent replay.
  getUndeliveredUnreadMessages(toHandle: string, types?: MessageType[]): MessageRow[] {
    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',')
      return exposeMessageListTimestamps(
        this.db
          .prepare(
            `SELECT * FROM messages WHERE to_handle = ? AND read = 0 AND delivered_at IS NULL AND type IN (${placeholders}) ORDER BY sequence`
          )
          .all(toHandle, ...types) as MessageRow[]
      )
    }
    return exposeMessageListTimestamps(
      this.db
        .prepare(
          'SELECT * FROM messages WHERE to_handle = ? AND read = 0 AND delivered_at IS NULL ORDER BY sequence'
        )
        .all(toHandle) as MessageRow[]
    )
  }

  getAllMessages(toHandle: string, limit = 20): MessageRow[] {
    return exposeMessageListTimestamps(
      this.db
        .prepare('SELECT * FROM messages WHERE to_handle = ? ORDER BY sequence DESC LIMIT ?')
        .all(toHandle, limit) as MessageRow[]
    )
  }

  getMessageById(id: string): MessageRow | undefined {
    const message = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
      | MessageRow
      | undefined
    return message ? exposeMessageTimestamps(message) : undefined
  }

  markAsRead(ids: string[]): void {
    if (ids.length === 0) {
      return
    }
    const placeholders = ids.map(() => '?').join(',')
    this.db.prepare(`UPDATE messages SET read = 1 WHERE id IN (${placeholders})`).run(...ids)
  }

  // Why: use datetime('now') so delivered_at matches the space-format UTC shape of the table's other timestamps for correct ordering (§3.2).
  markAsDelivered(ids: string[]): void {
    if (ids.length === 0) {
      return
    }
    const placeholders = ids.map(() => '?').join(',')
    this.db
      .prepare(`UPDATE messages SET delivered_at = datetime('now') WHERE id IN (${placeholders})`)
      .run(...ids)
  }

  markAsReadAndDelivered(ids: string[]): void {
    if (ids.length === 0) {
      return
    }
    const placeholders = ids.map(() => '?').join(',')
    // Why: superseded lifecycle messages stay in history but must not be consumed or injected after their dispatch finished.
    this.db
      .prepare(
        `UPDATE messages SET read = 1, delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id IN (${placeholders})`
      )
      .run(...ids)
  }

  getInbox(limit = 20): MessageRow[] {
    return exposeMessageListTimestamps(
      this.db
        .prepare('SELECT * FROM messages ORDER BY sequence DESC LIMIT ?')
        .all(limit) as MessageRow[]
    )
  }

  // Why: read-only history for a handle — returns every message regardless of read/delivered state, never flips the read bit (§3.3).
  getAllMessagesForHandle(toHandle: string, limit = 100, types?: MessageType[]): MessageRow[] {
    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',')
      return exposeMessageListTimestamps(
        this.db
          .prepare(
            `SELECT * FROM messages WHERE to_handle = ? AND type IN (${placeholders}) ORDER BY sequence DESC LIMIT ?`
          )
          .all(toHandle, ...types, limit) as MessageRow[]
      )
    }
    return exposeMessageListTimestamps(
      this.db
        .prepare('SELECT * FROM messages WHERE to_handle = ? ORDER BY sequence DESC LIMIT ?')
        .all(toHandle, limit) as MessageRow[]
    )
  }

  // Why: ask wait-loop read — to_handle filter shows only replies to the worker; afterSequence resumes past its own outbound ask.
  getThreadMessagesFor(threadId: string, toHandle: string, afterSequence?: number): MessageRow[] {
    if (afterSequence !== undefined) {
      return exposeMessageListTimestamps(
        this.db
          .prepare(
            'SELECT * FROM messages WHERE thread_id = ? AND to_handle = ? AND sequence > ? ORDER BY sequence ASC'
          )
          .all(threadId, toHandle, afterSequence) as MessageRow[]
      )
    }
    return exposeMessageListTimestamps(
      this.db
        .prepare(
          'SELECT * FROM messages WHERE thread_id = ? AND to_handle = ? ORDER BY sequence ASC'
        )
        .all(threadId, toHandle) as MessageRow[]
    )
  }

  createQuestion(params: {
    runId: string
    dispatchId: string
    askerHandle: string
    question: string
    options?: string[]
  }): { question: QuestionRow; message: MessageRow } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.requireRun(params.runId)
      const dispatch = this.getDispatchContextById(params.dispatchId)
      if (
        !dispatch ||
        dispatch.run_id !== params.runId ||
        (dispatch.status !== 'pending' && dispatch.status !== 'dispatched')
      ) {
        throw new OrchestrationError(
          'dispatch_inactive',
          `Dispatch ${params.dispatchId} is not active in Run ${params.runId}.`
        )
      }
      const message = this.insertMessage({
        from: `dispatch:${params.dispatchId}`,
        to: `run:${params.runId}`,
        subject: 'Question',
        body: params.question,
        type: 'question',
        payload: JSON.stringify({
          taskId: dispatch.task_id,
          dispatchId: dispatch.id,
          question: params.question,
          options: params.options ?? []
        }),
        runId: params.runId
      })
      this.db.prepare('UPDATE messages SET thread_id = ? WHERE id = ?').run(message.id, message.id)
      this.db
        .prepare(
          `INSERT INTO question_threads (
             message_id, run_id, dispatch_id, asker_handle
           ) VALUES (?, ?, ?, ?)`
        )
        .run(message.id, params.runId, params.dispatchId, params.askerHandle)
      const question = this.getQuestionRaw(message.id) as QuestionRow
      const storedMessage = this.getMessageById(message.id) as MessageRow
      this.db.exec('COMMIT')
      return { question: exposeQuestionTimestamps(question), message: storedMessage }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getQuestion(messageId: string): QuestionRow | undefined {
    const question = this.getQuestionRaw(messageId)
    return question ? exposeQuestionTimestamps(question) : undefined
  }

  protected getQuestionRaw(messageId: string): QuestionRow | undefined {
    return this.db.prepare('SELECT * FROM question_threads WHERE message_id = ?').get(messageId) as
      | QuestionRow
      | undefined
  }

  answerQuestion(params: {
    messageId: string
    runId: string
    consumerGeneration: number
    body: string
  }): { question: QuestionRow; message: MessageRow; duplicate: boolean } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.requireCurrentConsumer(params.runId, params.consumerGeneration)
      const question = this.getQuestionRaw(params.messageId)
      if (!question || question.run_id !== params.runId) {
        throw new OrchestrationError(
          'question_not_found',
          `Question ${params.messageId} was not found in Run ${params.runId}.`
        )
      }
      if (question.status === 'closed') {
        throw new OrchestrationError(
          'dispatch_inactive',
          `Question ${params.messageId} is closed because its Dispatch is inactive.`
        )
      }
      if (question.status === 'answered') {
        if (question.answer_body !== params.body || !question.answer_message_id) {
          throw new OrchestrationError(
            'answer_conflict',
            `Question ${params.messageId} already has a different answer.`
          )
        }
        const message = this.getMessageById(question.answer_message_id)
        if (!message) {
          throw new Error(`Recorded answer message ${question.answer_message_id} was not found.`)
        }
        this.db.exec('COMMIT')
        return { question: exposeQuestionTimestamps(question), message, duplicate: true }
      }

      const message = this.insertMessage({
        from: `run:${params.runId}`,
        to: `dispatch:${question.dispatch_id}`,
        subject: 'Re: Question',
        body: params.body,
        threadId: question.message_id,
        runId: params.runId
      })
      // Why: ask returns thread state directly; leaving its answer unread would deliver it again via check.
      this.markAsRead([message.id])
      this.db
        .prepare(
          `UPDATE question_threads
           SET status = 'answered', answer_message_id = ?, answer_body = ?,
               answered_by_generation = ?, answered_at = datetime('now')
           WHERE message_id = ? AND status = 'pending'`
        )
        .run(message.id, params.body, params.consumerGeneration, question.message_id)
      const answered = this.getQuestionRaw(question.message_id) as QuestionRow
      const storedMessage = this.getMessageById(message.id) as MessageRow
      this.db.exec('COMMIT')
      return {
        question: exposeQuestionTimestamps(answered),
        message: storedMessage,
        duplicate: false
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
