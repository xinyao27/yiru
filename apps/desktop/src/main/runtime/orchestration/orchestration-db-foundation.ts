import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync } from 'node:fs'

import { ORCHESTRATION_LEGACY_RUN_ID } from '~shared/orchestration-rpc-contract'
import { parsePaneKey } from '~shared/stable-pane-id'

import type {
  MessageType,
  MessagePriority,
  TaskStatus,
  DispatchStatus,
  GateStatus,
  CoordinatorStatus,
  MessageRow,
  TaskRow,
  DispatchContextRow,
  DecisionGateRow,
  CoordinatorRun,
  WorkerReportOutcome,
  WorkerReportSettlement,
  RunRow,
  DeliveryRow,
  DeliveryStatus,
  QuestionRow,
  QuestionStatus,
  MutationReceiptRow,
  MutationState,
  WorkerDispatchRow,
  WorkerDispatchState
} from './types'

// Why: leaf UUID is the remint-stable pane identity (tab half changes on break-out); exact match covers legacy/unparseable keys.
export function isEquivalentPaneKey(a: string, b: string): boolean {
  if (a === b) {
    return true
  }
  const aLeaf = parsePaneKey(a)?.leafId
  const bLeaf = parsePaneKey(b)?.leafId
  return Boolean(aLeaf && bLeaf && aLeaf === bLeaf)
}

export type {
  MessageType,
  MessagePriority,
  TaskStatus,
  DispatchStatus,
  GateStatus,
  CoordinatorStatus,
  MessageRow,
  TaskRow,
  DispatchContextRow,
  DecisionGateRow,
  CoordinatorRun,
  WorkerReportOutcome,
  WorkerReportSettlement,
  RunRow,
  DeliveryRow,
  DeliveryStatus,
  QuestionRow,
  QuestionStatus,
  MutationReceiptRow,
  MutationState,
  WorkerDispatchRow,
  WorkerDispatchState
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`
}

export function hashDispatchCapability(capability: string): string {
  return createHash('sha256').update(capability).digest('hex')
}

export function addLifecycleRejectionMarker(
  payload: string | null,
  code: string,
  reason: string
): string {
  let parsed: Record<string, unknown> = {}
  try {
    const value: unknown = payload ? JSON.parse(payload) : {}
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>
    }
  } catch {
    // Authority reconciliation only reaches this path with object payloads.
  }
  return JSON.stringify({
    ...parsed,
    _yiruLifecycleRejection: { code, reason }
  })
}

export const SQLITE_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/

export function exposeUtcTimestamp(timestamp: string | null): string | null {
  if (!timestamp || !SQLITE_UTC_TIMESTAMP_RE.test(timestamp)) {
    return timestamp
  }
  return `${timestamp.replace(' ', 'T')}Z`
}

export function exposeMessageTimestamps(message: MessageRow): MessageRow {
  // Why: SQLite stores UTC as timezone-less space format for SQL ordering, but RPC/CLI consumers need an explicit offset.
  return {
    ...message,
    created_at: exposeUtcTimestamp(message.created_at) ?? message.created_at,
    delivered_at: exposeUtcTimestamp(message.delivered_at)
  }
}

export function exposeMessageListTimestamps(messages: MessageRow[]): MessageRow[] {
  return messages.map(exposeMessageTimestamps)
}

export function exposeRunTimestamps(run: RunRow): RunRow {
  return {
    ...run,
    created_at: exposeUtcTimestamp(run.created_at) ?? run.created_at,
    updated_at: exposeUtcTimestamp(run.updated_at) ?? run.updated_at
  }
}

export function exposeDeliveryTimestamps(delivery: DeliveryRow): DeliveryRow {
  return {
    ...delivery,
    created_at: exposeUtcTimestamp(delivery.created_at) ?? delivery.created_at,
    acknowledged_at: exposeUtcTimestamp(delivery.acknowledged_at)
  }
}

export function exposeQuestionTimestamps(question: QuestionRow): QuestionRow {
  return {
    ...question,
    created_at: exposeUtcTimestamp(question.created_at) ?? question.created_at,
    answered_at: exposeUtcTimestamp(question.answered_at),
    closed_at: exposeUtcTimestamp(question.closed_at)
  }
}

export const LEGACY_RUN_ID = ORCHESTRATION_LEGACY_RUN_ID

// Schema versions: v2 'heartbeat'+last_heartbeat_at, v3 delivered_at, v4 task-creator terminal, v5 task_title/display_name, v6 pane identity, v7 lightweight Runs, v8 crash-safe Run deliveries, v9 durable question threads, v10 Dispatch capabilities, v11 durable mutation receipts, v12 composed worker state, v18 post-v6 version-skew repair.
export const SCHEMA_VERSION = 18

export function hardenOrchestrationDatabaseFiles(dbPath: string | ':memory:'): void {
  if (dbPath === ':memory:' || process.platform === 'win32') {
    // Why: Windows protects these files through Yiru's current-user-only userData DACL; POSIX mode bits are inert there.
    return
  }
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(path)) {
      chmodSync(path, 0o600)
    }
  }
}
