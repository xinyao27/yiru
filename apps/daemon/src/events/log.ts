import { EventPublisher } from '@orpc/server'

import type { DaemonDatabase } from '../store/database'

const MAX_EVENT_PAGE_SIZE = 500

export type WorkspaceEventPayload = Record<string, boolean | number | string | null>

export type WorkspaceEvent = {
  id: number
  kind: string
  occurredAt: number
  payload: WorkspaceEventPayload
  revision: number
  scope: string
}

type WorkspaceEventRow = {
  id: number
  kind: string
  occurredAt: number
  payload: string
  revision: number
  scope: string
}

type WorkspaceEventChannels = {
  appended: WorkspaceEvent
}

export class WorkspaceEventLog {
  private readonly database: DaemonDatabase
  private readonly publisher = new EventPublisher<WorkspaceEventChannels>({
    maxBufferedEvents: 1
  })
  private readonly revisionQueues = new Map<string, Promise<void>>()

  constructor(database: DaemonDatabase) {
    this.database = database
  }

  append(scope: string, kind: string, payload: WorkspaceEventPayload): WorkspaceEvent {
    const event = this.database.sqlite.transaction(() => {
      this.database.sqlite
        .query(
          `INSERT INTO workspace_revision(scope, revision)
           VALUES (?1, 0)
           ON CONFLICT(scope) DO NOTHING`
        )
        .run(scope)
      const revisionRow = this.database.sqlite
        .query<{ revision: number }, [string]>(
          `UPDATE workspace_revision
           SET revision = revision + 1
           WHERE scope = ?1
           RETURNING revision`
        )
        .get(scope)
      if (!revisionRow) {
        throw new Error('workspace_revision_unavailable')
      }
      const occurredAt = Date.now()
      const inserted = this.database.sqlite
        .query<{ id: number }, [string, number, string, string, number]>(
          `INSERT INTO workspace_event(scope, revision, kind, payload, occurred_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           RETURNING id`
        )
        .get(scope, revisionRow.revision, kind, JSON.stringify(payload), occurredAt)
      if (!inserted) {
        throw new Error('workspace_event_insert_failed')
      }
      return {
        id: inserted.id,
        kind,
        occurredAt,
        payload,
        revision: revisionRow.revision,
        scope
      }
    })()
    this.publisher.publish('appended', event)
    return event
  }

  list(scope: string, afterId = 0, limit = 100): WorkspaceEvent[] {
    const pageSize = Math.max(1, Math.min(Math.floor(limit), MAX_EVENT_PAGE_SIZE))
    const rows = this.database.sqlite
      .query<WorkspaceEventRow, [string, number, number]>(
        `SELECT id, scope, revision, kind, payload, occurred_at AS occurredAt
         FROM workspace_event
         WHERE scope = ?1 AND id > ?2
         ORDER BY id ASC
         LIMIT ?3`
      )
      .all(scope, afterId, pageSize)
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      occurredAt: row.occurredAt,
      payload: parsePayload(row.payload),
      revision: row.revision,
      scope: row.scope
    }))
  }

  revision(scope: string): number {
    return (
      this.database.sqlite
        .query<{ revision: number }, [string]>(
          'SELECT revision FROM workspace_revision WHERE scope = ?1'
        )
        .get(scope)?.revision ?? 0
    )
  }

  latestId(scope: string): number {
    return (
      this.database.sqlite
        .query<{ id: number | null }, [string]>(
          'SELECT MAX(id) AS id FROM workspace_event WHERE scope = ?1'
        )
        .get(scope)?.id ?? 0
    )
  }

  countSince(scope: string, occurredAfter: number): number {
    return (
      this.database.sqlite
        .query<{ count: number }, [string, number]>(
          `SELECT COUNT(*) AS count FROM workspace_event
           WHERE scope = ?1 AND occurred_at > ?2`
        )
        .get(scope, occurredAfter)?.count ?? 0
    )
  }

  assertRevision(scope: string, expectedRevision: number): void {
    const actualRevision = this.revision(scope)
    if (actualRevision !== expectedRevision) {
      throw new WorkspaceRevisionConflict(scope, expectedRevision, actualRevision)
    }
  }

  async runAtRevision<T>(
    scope: string,
    expectedRevision: number,
    operation: () => Promise<T> | T
  ): Promise<T> {
    const previous = this.revisionQueues.get(scope) ?? Promise.resolve()
    let release = (): void => {}
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const queued = previous.then(() => current)
    this.revisionQueues.set(scope, queued)
    await previous
    try {
      this.assertRevision(scope, expectedRevision)
      return await operation()
    } finally {
      release()
      if (this.revisionQueues.get(scope) === queued) {
        this.revisionQueues.delete(scope)
      }
    }
  }

  async *subscribe(
    scope: string,
    afterId = 0,
    signal?: AbortSignal
  ): AsyncGenerator<WorkspaceEvent> {
    const iterator = signal
      ? this.publisher.subscribe('appended', { maxBufferedEvents: 1, signal })
      : this.publisher.subscribe('appended', { maxBufferedEvents: 1 })
    let cursor = afterId
    try {
      while (true) {
        const events = this.list(scope, cursor, MAX_EVENT_PAGE_SIZE)
        for (const event of events) {
          cursor = event.id
          yield event
        }
        if (events.length === MAX_EVENT_PAGE_SIZE) {
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

export class WorkspaceRevisionConflict extends Error {
  readonly actualRevision: number
  readonly expectedRevision: number
  readonly scope: string

  constructor(scope: string, expectedRevision: number, actualRevision: number) {
    super('workspace_revision_conflict')
    this.name = 'WorkspaceRevisionConflict'
    this.actualRevision = actualRevision
    this.expectedRevision = expectedRevision
    this.scope = scope
  }
}

function parsePayload(serialized: string): WorkspaceEventPayload {
  const value: unknown = JSON.parse(serialized)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  const payload: WorkspaceEventPayload = {}
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry === null ||
      typeof entry === 'boolean' ||
      typeof entry === 'number' ||
      typeof entry === 'string'
    ) {
      payload[key] = entry
    }
  }
  return payload
}
