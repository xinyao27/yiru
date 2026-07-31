import type SyncDatabase from '~main/sqlite/sync-database'

import { addSessionTokens } from './scanner-accumulator'
import type { SessionAccumulator } from './scanner-types'
import { asRecord, timeObjectValue, tokenTotal } from './scanner-values'

type OpenCodeMessageUsageRow = {
  time_created: number
  data: string
}

export function consumeOpenCodeSqliteUsage(
  db: SyncDatabase,
  sessionId: string,
  accumulator: SessionAccumulator
): boolean {
  const rows = selectUsageRows(db, sessionId)
  let hasUsage = false
  for (const row of rows) {
    const message = parseMessage(row.data)
    const tokens = tokenTotal(message?.tokens)
    if (tokens <= 0) {
      continue
    }
    hasUsage = true
    addSessionTokens(
      accumulator,
      tokens,
      timeObjectValue(message?.time, 'created') ?? row.time_created
    )
  }
  return hasUsage
}

function selectUsageRows(db: SyncDatabase, sessionId: string): OpenCodeMessageUsageRow[] {
  if (hasUsageTable(db, 'session_message')) {
    return narrowUsageRows(
      db
        .prepare(
          `SELECT time_created, data
         FROM session_message
         WHERE session_id = ?
           AND json_extract(data, '$.role') = 'assistant'
         ORDER BY time_created, id`
        )
        .all(sessionId)
    )
  }
  if (hasUsageTable(db, 'message')) {
    return narrowUsageRows(
      db
        .prepare(
          `SELECT time_created, data
         FROM message
         WHERE session_id = ?
           AND json_extract(data, '$.role') = 'assistant'
         ORDER BY time_created, id`
        )
        .all(sessionId)
    )
  }
  return []
}

function hasUsageTable(db: SyncDatabase, tableName: 'message' | 'session_message'): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS column_count
       FROM pragma_table_info(?)
       WHERE name IN ('id', 'session_id', 'time_created', 'data')`
    )
    .get(tableName)
  return row?.column_count === 4
}

function narrowUsageRows(rows: readonly Record<string, unknown>[]): OpenCodeMessageUsageRow[] {
  return rows.flatMap((row) =>
    typeof row.time_created === 'number' && typeof row.data === 'string'
      ? [{ time_created: row.time_created, data: row.data }]
      : []
  )
}

function parseMessage(value: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value) as unknown)
  } catch {
    return null
  }
}
