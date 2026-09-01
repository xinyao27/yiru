import {
  generateId,
  addLifecycleRejectionMarker,
  exposeMessageTimestamps,
  exposeMessageListTimestamps,
  exposeDeliveryTimestamps,
  LEGACY_RUN_ID
} from './orchestration-db-foundation'
import { OrchestrationDbLayer3 } from './orchestration-db-layer-3'
import { OrchestrationError } from './orchestration-error'
import type { MessageType, MessagePriority, MessageRow, DeliveryRow } from './types'

export abstract class OrchestrationDbLayer4 extends OrchestrationDbLayer3 {
  protected getDeliveryMessages(delivery: DeliveryRow): MessageRow[] {
    const ids = JSON.parse(delivery.message_ids) as string[]
    if (ids.length === 0) {
      return []
    }
    const rows = this.db
      .prepare(`SELECT * FROM messages WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids) as MessageRow[]
    const byId = new Map(rows.map((row) => [row.id, row]))
    return exposeMessageListTimestamps(
      ids.map((id) => byId.get(id)).filter((row): row is MessageRow => row !== undefined)
    )
  }

  getOrCreateRunDelivery(params: {
    runId: string
    consumerGeneration: number
    limit?: number
    wakeTypes?: MessageType[]
  }): { delivery: DeliveryRow; messages: MessageRow[]; replayed: boolean } | undefined {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 50)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.requireCurrentConsumer(params.runId, params.consumerGeneration)
      const existing = this.db
        .prepare("SELECT * FROM deliveries WHERE run_id = ? AND status = 'outstanding'")
        .get(params.runId) as DeliveryRow | undefined
      if (existing) {
        if (existing.consumer_generation !== params.consumerGeneration) {
          throw new OrchestrationError(
            'consumer_fenced',
            'This mailbox Delivery belongs to a fenced consumer generation.'
          )
        }
        const messages = this.getDeliveryMessages(existing)
        this.db.exec('COMMIT')
        return { delivery: exposeDeliveryTimestamps(existing), messages, replayed: true }
      }

      const address = `run:${params.runId}`
      if (params.wakeTypes && params.wakeTypes.length > 0) {
        const placeholders = params.wakeTypes.map(() => '?').join(',')
        const matching = this.db
          .prepare(
            `SELECT 1 FROM messages
             WHERE run_id = ? AND to_handle = ? AND read = 0
               AND type IN (${placeholders}) LIMIT 1`
          )
          .get(params.runId, address, ...params.wakeTypes)
        if (!matching) {
          this.db.exec('COMMIT')
          return undefined
        }
      }

      const messages = exposeMessageListTimestamps(
        this.db
          .prepare(
            `SELECT * FROM messages
             WHERE run_id = ? AND to_handle = ? AND read = 0
             ORDER BY sequence ASC LIMIT ?`
          )
          .all(params.runId, address, limit) as MessageRow[]
      )
      if (messages.length === 0) {
        this.db.exec('COMMIT')
        return undefined
      }

      const deliveryId = generateId('delivery')
      this.db
        .prepare(
          `INSERT INTO deliveries (id, run_id, consumer_generation, message_ids)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          deliveryId,
          params.runId,
          params.consumerGeneration,
          JSON.stringify(messages.map((message) => message.id))
        )
      const delivery = this.getDeliveryRaw(deliveryId) as DeliveryRow
      this.db.exec('COMMIT')
      return { delivery: exposeDeliveryTimestamps(delivery), messages, replayed: false }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  acknowledgeRunDelivery(params: {
    runId: string
    consumerGeneration: number
    deliveryId: string
  }): { delivery: DeliveryRow; duplicate: boolean } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.requireCurrentConsumer(params.runId, params.consumerGeneration)
      const delivery = this.getDeliveryRaw(params.deliveryId)
      if (!delivery || delivery.run_id !== params.runId) {
        throw new OrchestrationError(
          'stale_delivery',
          `Delivery ${params.deliveryId} does not belong to this Run.`
        )
      }
      if (
        delivery.consumer_generation !== params.consumerGeneration ||
        delivery.status === 'fenced'
      ) {
        throw new OrchestrationError(
          'consumer_fenced',
          'This mailbox Delivery belongs to a fenced consumer generation.'
        )
      }
      if (delivery.status === 'acknowledged') {
        this.db.exec('COMMIT')
        return { delivery: exposeDeliveryTimestamps(delivery), duplicate: true }
      }

      const messageIds = JSON.parse(delivery.message_ids) as string[]
      if (messageIds.length > 0) {
        const placeholders = messageIds.map(() => '?').join(',')
        this.db
          .prepare(`UPDATE messages SET read = 1 WHERE id IN (${placeholders})`)
          .run(...messageIds)
      }
      this.db
        .prepare(
          "UPDATE deliveries SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id = ?"
        )
        .run(delivery.id)
      const acknowledged = this.getDeliveryRaw(delivery.id) as DeliveryRow
      this.db.exec('COMMIT')
      return { delivery: exposeDeliveryTimestamps(acknowledged), duplicate: false }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getRunMailboxHistory(runId: string, limit = 100, types?: MessageType[]): MessageRow[] {
    const address = `run:${runId}`
    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',')
      return exposeMessageListTimestamps(
        this.db
          .prepare(
            `SELECT * FROM messages WHERE run_id = ? AND to_handle = ?
             AND type IN (${placeholders}) ORDER BY sequence DESC LIMIT ?`
          )
          .all(runId, address, ...types, limit) as MessageRow[]
      )
    }
    return exposeMessageListTimestamps(
      this.db
        .prepare(
          `SELECT * FROM messages WHERE run_id = ? AND to_handle = ?
           ORDER BY sequence DESC LIMIT ?`
        )
        .all(runId, address, limit) as MessageRow[]
    )
  }

  // ── Messages ──

  insertMessage(msg: {
    id?: string
    from: string
    to: string
    subject: string
    body?: string
    type?: MessageType
    priority?: MessagePriority
    threadId?: string
    payload?: string
    senderPaneKey?: string
    runId?: string
  }): MessageRow {
    const runId = msg.runId ?? LEGACY_RUN_ID
    this.requireRun(runId)
    const id = msg.id ?? generateId('msg')
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, run_id, from_handle, to_handle, subject, body, type, priority, thread_id, payload, sender_pane_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      runId,
      msg.from,
      msg.to,
      msg.subject,
      msg.body ?? '',
      msg.type ?? 'status',
      msg.priority ?? 'normal',
      msg.threadId ?? null,
      msg.payload ?? null,
      msg.senderPaneKey ?? null
    )
    return exposeMessageTimestamps(
      this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow
    )
  }

  getUnreadMessages(toHandle: string, types?: MessageType[]): MessageRow[] {
    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',')
      return exposeMessageListTimestamps(
        this.db
          .prepare(
            `SELECT * FROM messages WHERE to_handle = ? AND read = 0 AND type IN (${placeholders}) ORDER BY sequence`
          )
          .all(toHandle, ...types) as MessageRow[]
      )
    }
    return exposeMessageListTimestamps(
      this.db
        .prepare('SELECT * FROM messages WHERE to_handle = ? AND read = 0 ORDER BY sequence')
        .all(toHandle) as MessageRow[]
    )
  }

  convertLifecycleMessageToRejection(
    messageId: string,
    code: string,
    reason: string
  ): MessageRow | undefined {
    const message = this.getMessageById(messageId)
    if (!message || (message.type !== 'worker_done' && message.type !== 'heartbeat')) {
      return message
    }

    const originalBody = message.body ? `\n\nOriginal body:\n${message.body}` : ''
    const body = `Yiru rejected this ${message.type}: ${reason}${originalBody}`
    const payload = addLifecycleRejectionMarker(message.payload, code, reason)
    // Why: rejected lifecycle signals stay auditable but must not reach read paths as actionable completion/liveness events.
    this.db
      .prepare(
        `UPDATE messages
         SET priority = 'high', subject = ?, body = ?, payload = ?
         WHERE id = ?`
      )
      .run(`Rejected ${message.type}: ${message.subject}`, body, payload, messageId)
    return this.getMessageById(messageId)
  }
}
