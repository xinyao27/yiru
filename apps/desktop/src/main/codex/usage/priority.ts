import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import SyncDatabase from '../../sqlite/sync-database'
import { getCodexAccountHomeSessionDirectories } from '../account-home-discovery'
import { getSystemCodexHomePath, getYiruManagedCodexHomePath } from '../home-paths'

export type CodexPrioritySnapshot = {
  modelsByTurnId: ReadonlyMap<string, string | null>
  fingerprint: string
}

type PriorityDatabaseState = {
  size: number
  mtimeMs: number
  lastRowId: number
  modelsByTurnId: Map<string, string | null>
  pendingCompletedModels: Map<string, string>
}

type PriorityTrace = {
  turnId: string
  model: string | null
}

const PRIORITY_LOG_FILE = 'logs_2.sqlite'
const PRIORITY_MAX_PENDING_COMPLETIONS = 4096
const priorityDatabaseStates = new Map<string, PriorityDatabaseState>()

export function loadCodexPrioritySnapshot(): CodexPrioritySnapshot {
  const modelsByTurnId = new Map<string, string | null>()
  for (const databasePath of codexPriorityDatabasePaths()) {
    for (const [turnId, model] of scanPriorityDatabase(databasePath)) {
      const existing = modelsByTurnId.get(turnId)
      modelsByTurnId.set(turnId, model ?? existing ?? null)
    }
  }
  const fingerprint = JSON.stringify(
    [...modelsByTurnId.entries()].sort(([left], [right]) => left.localeCompare(right))
  )
  return { modelsByTurnId, fingerprint }
}

function codexPriorityDatabasePaths(): string[] {
  const homes = [
    getSystemCodexHomePath(),
    getYiruManagedCodexHomePath(),
    ...getCodexAccountHomeSessionDirectories().map((path) => dirname(path))
  ]
  const paths = homes.flatMap((home) => [
    join(home, PRIORITY_LOG_FILE),
    join(home, 'sqlite', PRIORITY_LOG_FILE)
  ])
  return [...new Set(paths)]
}

function scanPriorityDatabase(databasePath: string): ReadonlyMap<string, string | null> {
  if (!existsSync(databasePath)) {
    return new Map()
  }
  let fileStat
  try {
    fileStat = statSync(databasePath)
  } catch {
    return new Map()
  }
  const previous = priorityDatabaseStates.get(databasePath)
  const state: PriorityDatabaseState =
    previous && fileStat.size >= previous.size
      ? previous
      : {
          size: 0,
          mtimeMs: 0,
          lastRowId: 0,
          modelsByTurnId: new Map(),
          pendingCompletedModels: new Map()
        }

  if (state.size === fileStat.size && state.mtimeMs === fileStat.mtimeMs) {
    return state.modelsByTurnId
  }

  let db: SyncDatabase | null = null
  try {
    db = new SyncDatabase(databasePath, { readonly: true, fileMustExist: true, timeout: 250 })
    db.pragma('query_only = ON')
    const rows = db
      .prepare(
        `SELECT rowid, feedback_log_body
         FROM logs
         WHERE rowid > ?
           AND (feedback_log_body LIKE '%websocket request:%'
             OR feedback_log_body LIKE '%websocket event:%'
             OR feedback_log_body LIKE '%service_tier: Some(Some("priority"))%')
         ORDER BY rowid`
      )
      .all(state.lastRowId) as readonly Record<string, unknown>[]
    for (const row of rows) {
      const rowId = finiteNumber(row.rowid)
      const body = stringValue(row.feedback_log_body)
      if (rowId === null || !body) {
        continue
      }
      state.lastRowId = Math.max(state.lastRowId, rowId)
      const completed = parseCompletedTrace(body)
      if (completed) {
        applyCompletedTrace(state, completed)
        continue
      }
      const priority = parsePriorityTrace(body)
      if (priority) {
        state.modelsByTurnId.set(
          priority.turnId,
          state.pendingCompletedModels.get(priority.turnId) ?? priority.model
        )
        state.pendingCompletedModels.delete(priority.turnId)
      }
    }
    state.size = fileStat.size
    state.mtimeMs = fileStat.mtimeMs
    priorityDatabaseStates.set(databasePath, state)
    return state.modelsByTurnId
  } catch {
    return previous?.modelsByTurnId ?? new Map()
  } finally {
    db?.close()
  }
}

function applyCompletedTrace(state: PriorityDatabaseState, trace: PriorityTrace): void {
  if (state.modelsByTurnId.has(trace.turnId)) {
    state.modelsByTurnId.set(trace.turnId, trace.model)
    return
  }
  state.pendingCompletedModels.set(trace.turnId, trace.model ?? '')
  while (state.pendingCompletedModels.size > PRIORITY_MAX_PENDING_COMPLETIONS) {
    const oldest = state.pendingCompletedModels.keys().next().value
    if (oldest === undefined) {
      break
    }
    state.pendingCompletedModels.delete(oldest)
  }
}

function parsePriorityTrace(body: string): PriorityTrace | null {
  const requestMarker = 'websocket request:'
  const markerIndex = body.indexOf(requestMarker)
  if (markerIndex >= 0) {
    const prefix = body.slice(0, markerIndex)
    const request = parseRecord(body.slice(markerIndex + requestMarker.length))
    if (request?.type !== 'response.create' || request.service_tier !== 'priority') {
      return null
    }
    const turnId =
      namedValue(prefix, 'turn.id') ??
      namedValue(prefix, 'turn_id') ??
      stringValue(request.turn_id) ??
      stringValue(request.turnId)
    return turnId ? { turnId, model: stringValue(request.model) } : null
  }

  const submissionMarker = 'Submission sub=Submission {'
  if (!body.includes('service_tier: Some(Some("priority"))')) {
    return null
  }
  const submissionIndex = body.indexOf(submissionMarker)
  if (submissionIndex < 0) {
    return null
  }
  const turnId = quotedValue(body.slice(submissionIndex + submissionMarker.length), 'id')
  return turnId ? { turnId, model: null } : null
}

function parseCompletedTrace(body: string): PriorityTrace | null {
  const marker = 'websocket event:'
  const markerIndex = body.indexOf(marker)
  if (markerIndex < 0) {
    return null
  }
  const event = parseRecord(body.slice(markerIndex + marker.length))
  const response = recordValue(event?.response)
  if (event?.type !== 'response.completed' || !response) {
    return null
  }
  const model = stringValue(response.model)
  const prefix = body.slice(0, markerIndex)
  const turnId = namedValue(prefix, 'turn.id') ?? namedValue(prefix, 'turn_id')
  return turnId && model ? { turnId, model } : null
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    return recordValue(JSON.parse(value.trim()) as unknown)
  } catch {
    return null
  }
}

function namedValue(text: string, name: string): string | null {
  const marker = `${name}=`
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) {
    return null
  }
  const tail = text.slice(markerIndex + marker.length)
  const end = tail.search(/[\s,\])}:]/)
  return stringValue(end < 0 ? tail : tail.slice(0, end))
}

function quotedValue(text: string, name: string): string | null {
  const marker = `${name}: "`
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) {
    return null
  }
  const tail = text.slice(markerIndex + marker.length)
  const end = tail.indexOf('"')
  return stringValue(end < 0 ? null : tail.slice(0, end))
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}
