import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'

import type Database from '~main/sqlite/sync-database'

import { columnExists, tableExists } from './schema-introspection'
import type { OpenCodeUsageProcessedDatabase } from './types'

export type OpenCodeUsageRow = {
  id: string
  session_id: string
  time_created: number
  time_updated: number | null
  data: string
  directory: string | null
  title: string | null
  worktree: string | null
  session_model: string | null
  cost_override: number | null
  has_step_finish_parts: number
}

export async function listOpenCodeDatabases(): Promise<string[]> {
  const environmentPath = getDatabasePathFromEnvironment()
  if (environmentPath) {
    return existsSync(environmentPath) ? [environmentPath] : []
  }
  try {
    const entries = await readdir(getOpenCodeDataDirectory(), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && /^opencode(?:-[A-Za-z0-9_.-]+)?\.db$/.test(entry.name))
      .map((entry) => join(getOpenCodeDataDirectory(), entry.name))
      .sort()
  } catch {
    return []
  }
}

export function compareOpenCodeClaimPriority(left: string, right: string): number {
  const leftRank = basename(left).toLowerCase() === 'opencode.db' ? 0 : 1
  const rightRank = basename(right).toLowerCase() === 'opencode.db' ? 0 : 1
  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }
  return left < right ? -1 : left > right ? 1 : 0
}

export async function getProcessedDatabaseInfo(
  dbPath: string
): Promise<OpenCodeUsageProcessedDatabase> {
  const databaseStat = await stat(dbPath)
  return { path: dbPath, mtimeMs: databaseStat.mtimeMs, size: databaseStat.size }
}

export function selectOpenCodeUsageRows(db: Database): OpenCodeUsageRow[] {
  if (!tableExists(db, 'session')) {
    return []
  }
  const projectJoin = getProjectJoin(db)
  const sessionModelSelect = getSessionModelSelect(db)
  let detailedRows: OpenCodeUsageRow[] = []
  if (getAssistantSessionMessageCount(db) > 0) {
    const assistantPredicate = columnExists(db, 'session_message', 'type')
      ? "sm.type = 'assistant'"
      : "json_extract(sm.data, '$.tokens.input') IS NOT NULL"
    detailedRows = db
      .prepare(
        `SELECT sm.id, sm.session_id, sm.time_created, sm.time_updated, sm.data,
                s.directory, s.title, p.worktree, ${sessionModelSelect},
                NULL AS cost_override, 0 AS has_step_finish_parts
         FROM session_message sm
         JOIN session s ON s.id = sm.session_id
         ${projectJoin}
         WHERE ${assistantPredicate}
         ORDER BY sm.time_created, sm.id`
      )
      .all() as OpenCodeUsageRow[]
  }
  if (getAssistantMessageCount(db) > 0) {
    const modernSessionIds = new Set(detailedRows.map((row) => row.session_id))
    const legacyRows = db.prepare(getMessageUsageQuery(db)).all() as OpenCodeUsageRow[]
    detailedRows.push(...legacyRows.filter((row) => !modernSessionIds.has(row.session_id)))
  }
  return detailedRows.sort(
    (left, right) => left.time_created - right.time_created || left.id.localeCompare(right.id)
  )
}

function getOpenCodeDataDirectory(): string {
  return join(getXdgDataHome(), 'opencode')
}

function getXdgDataHome(): string {
  if (process.env.XDG_DATA_HOME?.trim()) {
    return process.env.XDG_DATA_HOME.trim()
  }
  return process.platform === 'win32'
    ? process.env.LOCALAPPDATA || process.env.APPDATA || join(homedir(), 'AppData', 'Local')
    : join(homedir(), '.local', 'share')
}

function getDatabasePathFromEnvironment(): string | null {
  const raw = process.env.OPENCODE_DB?.trim()
  if (!raw || raw === ':memory:') {
    return null
  }
  return isAbsolute(raw) ? raw : join(getOpenCodeDataDirectory(), raw)
}

function getProjectJoin(db: Database): string {
  return tableExists(db, 'project') && columnExists(db, 'session', 'project_id')
    ? 'LEFT JOIN project p ON p.id = s.project_id'
    : 'LEFT JOIN (SELECT NULL AS id, NULL AS worktree) p ON 1 = 0'
}

function getSessionModelSelect(db: Database): string {
  return columnExists(db, 'session', 'model') ? 's.model AS session_model' : 'NULL AS session_model'
}

function getAssistantSessionMessageCount(db: Database): number {
  if (!tableExists(db, 'session_message')) {
    return 0
  }
  const predicate = columnExists(db, 'session_message', 'type')
    ? "type = 'assistant' AND json_extract(data, '$.tokens.input') IS NOT NULL"
    : "json_extract(data, '$.tokens.input') IS NOT NULL"
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM session_message WHERE ${predicate}`)
    .get() as { count?: number } | undefined
  return row?.count ?? 0
}

function getAssistantMessageCount(db: Database): number {
  if (!tableExists(db, 'message')) {
    return 0
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM message
       WHERE json_extract(data, '$.role') = 'assistant'
         AND json_extract(data, '$.tokens.input') IS NOT NULL`
    )
    .get() as { count?: number } | undefined
  return row?.count ?? 0
}

function getMessageUsageQuery(db: Database): string {
  const projectJoin = getProjectJoin(db)
  const sessionModelSelect = getSessionModelSelect(db)
  const hasPart = tableExists(db, 'part')
  const partJoin = hasPart ? 'LEFT JOIN part part_row ON part_row.message_id = m.id' : ''
  const partCostSelect = hasPart
    ? `CASE WHEN COUNT(CASE WHEN json_valid(part_row.data)
              AND json_extract(part_row.data, '$.type') = 'step-finish'
              AND json_type(part_row.data, '$.cost') IN ('integer', 'real') THEN 1 END) > 0
         THEN SUM(CASE WHEN json_valid(part_row.data)
              AND json_extract(part_row.data, '$.type') = 'step-finish'
              AND json_type(part_row.data, '$.cost') IN ('integer', 'real')
              THEN CAST(json_extract(part_row.data, '$.cost') AS REAL) ELSE 0 END)
         ELSE NULL END AS cost_override,
       CASE WHEN COUNT(CASE WHEN json_valid(part_row.data)
              AND json_extract(part_row.data, '$.type') = 'step-finish'
              AND json_type(part_row.data, '$.cost') IN ('integer', 'real') THEN 1 END) > 0
         THEN 1 ELSE 0 END AS has_step_finish_parts`
    : 'NULL AS cost_override, 0 AS has_step_finish_parts'
  const groupBy = hasPart
    ? `GROUP BY m.id, m.session_id, m.time_created, m.time_updated, m.data,
                s.directory, s.title, p.worktree, ${sessionModelSelect.replace(' AS session_model', '')}`
    : ''
  return `SELECT m.id, m.session_id, m.time_created, m.time_updated, m.data,
           s.directory, s.title, p.worktree, ${sessionModelSelect}, ${partCostSelect}
    FROM message m JOIN session s ON s.id = m.session_id
    ${projectJoin} ${partJoin}
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(m.data, '$.tokens.input') IS NOT NULL
    ${groupBy} ORDER BY m.time_created, m.id`
}
