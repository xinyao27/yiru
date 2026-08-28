import { EventPublisher } from '@orpc/server'
import type {
  MobileNotificationDismissEvent,
  MobileNotificationDispatchEvent,
  ReplayableMobileNotification
} from '@yiru/runtime-protocol/contract'

import type { DaemonDatabase } from '../store/database'

const REPLAY_CAPACITY = 256

type MobileNotificationEvent = MobileNotificationDispatchEvent | MobileNotificationDismissEvent
type MobileNotificationRow = { id: number; payload: string }
type NotificationChannels = { dispatched: ReplayableMobileNotification }

export class MobileNotificationChannel {
  private readonly database: DaemonDatabase
  private readonly publisher = new EventPublisher<NotificationChannels>({ maxBufferedEvents: 1 })
  private readonly subscriptions = new Map<string, AbortController>()

  constructor(database: DaemonDatabase) {
    this.database = database
  }

  dispatch(event: MobileNotificationEvent): ReplayableMobileNotification {
    const inserted = this.database.sqlite.transaction(() => {
      const row = this.database.sqlite
        .query<{ id: number }, [string, number]>(
          `INSERT INTO mobile_notification(payload, occurred_at)
           VALUES (?1, ?2)
           RETURNING id`
        )
        .get(JSON.stringify(event), Date.now())
      if (!row) {
        throw new Error('mobile_notification_insert_failed')
      }
      this.database.sqlite
        .query(
          `DELETE FROM mobile_notification
           WHERE id <= (SELECT COALESCE(MAX(id), 0) - ?1 FROM mobile_notification)`
        )
        .run(REPLAY_CAPACITY)
      return { ...event, notificationSeq: row.id }
    })()
    this.publisher.publish('dispatched', inserted)
    return inserted
  }

  dismiss(notificationId: string): ReplayableMobileNotification {
    return this.dispatch({ notificationId, type: 'dismiss' })
  }

  missedSince(lastSeenSeq: number): ReplayableMobileNotification[] {
    return this.database.sqlite
      .query<MobileNotificationRow, [number, number]>(
        `SELECT id, payload FROM mobile_notification
         WHERE id > ?1 ORDER BY id ASC LIMIT ?2`
      )
      .all(lastSeenSeq, REPLAY_CAPACITY)
      .flatMap(readNotification)
  }

  latestSequence(): number {
    return (
      this.database.sqlite
        .query<{ id: number }, []>('SELECT COALESCE(MAX(id), 0) AS id FROM mobile_notification')
        .get()?.id ?? 0
    )
  }

  openSubscription(): { id: string; signal: AbortSignal } {
    const id = `notifications-${crypto.randomUUID()}`
    const controller = new AbortController()
    this.subscriptions.set(id, controller)
    return { id, signal: controller.signal }
  }

  closeSubscription(id: string): boolean {
    const controller = this.subscriptions.get(id)
    if (!controller) {
      return false
    }
    this.subscriptions.delete(id)
    controller.abort()
    return true
  }

  async *subscribe(
    afterSequence: number,
    signal: AbortSignal
  ): AsyncGenerator<ReplayableMobileNotification> {
    const iterator = this.publisher.subscribe('dispatched', { maxBufferedEvents: 1, signal })
    let cursor = afterSequence
    try {
      while (!signal.aborted) {
        const replay = this.missedSince(cursor)
        for (const event of replay) {
          cursor = event.notificationSeq
          yield event
        }
        if (replay.length === REPLAY_CAPACITY) {
          continue
        }
        const next = await iterator.next()
        if (next.done) {
          return
        }
      }
    } finally {
      await iterator.return(undefined)
    }
  }
}

function readNotification(row: MobileNotificationRow): ReplayableMobileNotification[] {
  try {
    const value: unknown = JSON.parse(row.payload)
    if (typeof value !== 'object' || value === null) {
      return []
    }
    const type = Reflect.get(value, 'type')
    if (type === 'dismiss') {
      const notificationId = Reflect.get(value, 'notificationId')
      return typeof notificationId === 'string'
        ? [{ notificationId, notificationSeq: row.id, type }]
        : []
    }
    if (type !== 'notification') {
      return []
    }
    const source = Reflect.get(value, 'source')
    const title = Reflect.get(value, 'title')
    const body = Reflect.get(value, 'body')
    if (
      !['agent-task-complete', 'terminal-bell', 'test'].includes(String(source)) ||
      typeof title !== 'string' ||
      typeof body !== 'string'
    ) {
      return []
    }
    const notification: ReplayableMobileNotification = {
      body,
      notificationSeq: row.id,
      source,
      title,
      type
    }
    const worktreeId = Reflect.get(value, 'worktreeId')
    const notificationId = Reflect.get(value, 'notificationId')
    if (typeof worktreeId === 'string') {
      notification.worktreeId = worktreeId
    }
    if (typeof notificationId === 'string') {
      notification.notificationId = notificationId
    }
    return [notification]
  } catch {
    return []
  }
}
