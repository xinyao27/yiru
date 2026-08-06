/* eslint-disable max-lines -- Why: OpenCode usage analytics need to normalize multiple local DB schema generations, attribute worktrees, and build persisted projections in one auditable pipeline. */
import { existsSync } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, posix, win32 } from 'node:path'

import { yieldToEventLoop } from '@yiru/workbench-model/ui'
import Database from '~main/sqlite/sync-database'
import { canonicalizeUsageWorktreePaths } from '~main/usage-worktree-canonicalizer'
import { areWorktreePathsEqual } from '~main/worktree/logic'
import type { Repo } from '~shared/types'

import { columnExists, tableExists } from './schema-helpers'
import type {
  OpenCodeUsageAttributedEvent,
  OpenCodeUsageDailyAggregate,
  OpenCodeUsageLocationBreakdown,
  OpenCodeUsageLocationModelBreakdown,
  OpenCodeUsageModelBreakdown,
  OpenCodeUsageParsedEvent,
  OpenCodeUsagePersistedDatabase,
  OpenCodeUsageProcessedDatabase,
  OpenCodeUsageSession
} from './types'

export type OpenCodeUsageWorktreeRef = {
  repoId: string
  worktreeId: string
  path: string
  displayName: string
}

type OpenCodeUsageRow = {
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

const YIELD_EVERY_DATABASES = 2

function ensureNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0
  }
  return 0
}

function extractFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeComparablePath(pathValue: string, platform = process.platform): string {
  const normalized = pathValue.replace(/\\/g, '/')
  return platform === 'win32' || looksLikeWindowsPath(pathValue)
    ? normalized.toLowerCase()
    : normalized
}

function normalizeFsPath(pathValue: string, platform = process.platform): string {
  if (platform === 'win32' || looksLikeWindowsPath(pathValue)) {
    return win32.normalize(win32.resolve(pathValue))
  }
  return posix.normalize(posix.resolve(pathValue))
}

function looksLikeWindowsPath(pathValue: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
}

function getXdgDataHome(): string {
  if (process.env.XDG_DATA_HOME?.trim()) {
    return process.env.XDG_DATA_HOME.trim()
  }
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || process.env.APPDATA || join(homedir(), 'AppData', 'Local')
  }
  return join(homedir(), '.local', 'share')
}

function getOpenCodeDataDirectory(): string {
  return join(getXdgDataHome(), 'opencode')
}

function getOpenCodeDatabasePathFromEnv(): string | null {
  const raw = process.env.OPENCODE_DB?.trim()
  if (!raw) {
    return null
  }
  if (raw === ':memory:') {
    return null
  }
  return isAbsolute(raw) ? raw : join(getOpenCodeDataDirectory(), raw)
}

export async function listOpenCodeDatabases(): Promise<string[]> {
  const envPath = getOpenCodeDatabasePathFromEnv()
  if (envPath) {
    return existsSync(envPath) ? [envPath] : []
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

function compareOpenCodeClaimPriority(left: string, right: string): number {
  // Why: the canonical opencode.db is the live database; it must claim
  // duplicated sessions ahead of stale sibling copies. Remaining ties use
  // path order so ownership is deterministic across rescans.
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
  const dbStat = await stat(dbPath)
  return {
    path: dbPath,
    mtimeMs: dbStat.mtimeMs,
    size: dbStat.size
  }
}

function getProjectJoin(db: Database.Database): string {
  return tableExists(db, 'project') && columnExists(db, 'session', 'project_id')
    ? 'LEFT JOIN project p ON p.id = s.project_id'
    : 'LEFT JOIN (SELECT NULL AS id, NULL AS worktree) p ON 1 = 0'
}

function getSessionModelSelect(db: Database.Database): string {
  return columnExists(db, 'session', 'model') ? 's.model AS session_model' : 'NULL AS session_model'
}

function getAssistantSessionMessageCount(db: Database.Database): number {
  if (!tableExists(db, 'session_message')) {
    return 0
  }
  const assistantPredicate = columnExists(db, 'session_message', 'type')
    ? "type = 'assistant' AND json_extract(data, '$.tokens.input') IS NOT NULL"
    : "json_extract(data, '$.tokens.input') IS NOT NULL"
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM session_message WHERE ${assistantPredicate}`)
    .get() as { count?: number } | undefined
  return row?.count ?? 0
}

function getAssistantMessageCount(db: Database.Database): number {
  if (!tableExists(db, 'message')) {
    return 0
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM message
       WHERE json_extract(data, '$.role') = 'assistant'
         AND json_extract(data, '$.tokens.input') IS NOT NULL`
    )
    .get() as { count?: number } | undefined
  return row?.count ?? 0
}

function getMessageUsageQuery(db: Database.Database): string {
  const projectJoin = getProjectJoin(db)
  const sessionModelSelect = getSessionModelSelect(db)
  const partJoin = tableExists(db, 'part')
    ? 'LEFT JOIN part part_row ON part_row.message_id = m.id'
    : ''
  const partCostSelect = tableExists(db, 'part')
    ? `
       CASE
         WHEN COUNT(
           CASE
             WHEN json_valid(part_row.data)
               AND json_extract(part_row.data, '$.type') = 'step-finish'
               AND json_type(part_row.data, '$.cost') IN ('integer', 'real')
             THEN 1
           END
         ) > 0
         THEN SUM(
           CASE
             WHEN json_valid(part_row.data)
               AND json_extract(part_row.data, '$.type') = 'step-finish'
               AND json_type(part_row.data, '$.cost') IN ('integer', 'real')
             THEN CAST(json_extract(part_row.data, '$.cost') AS REAL)
             ELSE 0
           END
         )
         ELSE NULL
       END AS cost_override,
       CASE
         WHEN COUNT(
           CASE
             WHEN json_valid(part_row.data)
               AND json_extract(part_row.data, '$.type') = 'step-finish'
               AND json_type(part_row.data, '$.cost') IN ('integer', 'real')
             THEN 1
           END
         ) > 0
         THEN 1
         ELSE 0
       END AS has_step_finish_parts`
    : 'NULL AS cost_override, 0 AS has_step_finish_parts'
  const groupBy = tableExists(db, 'part')
    ? `
       GROUP BY m.id, m.session_id, m.time_created, m.time_updated, m.data,
                s.directory, s.title, p.worktree, ${sessionModelSelect.replace(' AS session_model', '')}`
    : ''

  return `
    SELECT m.id, m.session_id, m.time_created, m.time_updated, m.data,
           s.directory, s.title, p.worktree, ${sessionModelSelect},
           ${partCostSelect}
    FROM message m
    JOIN session s ON s.id = m.session_id
    ${projectJoin}
    ${partJoin}
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(m.data, '$.tokens.input') IS NOT NULL
    ${groupBy}
    ORDER BY m.time_created, m.id`
}

function selectUsageRows(db: Database.Database): OpenCodeUsageRow[] {
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

  // Why: session totals lack request-level model and day attribution. Exclude
  // them instead of manufacturing precise-looking chart distributions.
  return detailedRows.sort(
    (left, right) => left.time_created - right.time_created || left.id.localeCompare(right.id)
  )
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') {
    return null
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function extractString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function extractModelLabel(data: Record<string, unknown>, sessionModel: unknown): string | null {
  const directModel = extractString(data.modelID) ?? extractString(data.modelId)
  const directProvider = extractString(data.providerID) ?? extractString(data.providerId)
  if (directModel) {
    return directProvider ? `${directProvider}/${directModel}` : directModel
  }

  const modelObject = parseJsonObject(data.model) ?? parseJsonObject(sessionModel)
  if (!modelObject) {
    return null
  }
  const modelID = extractString(modelObject.modelID) ?? extractString(modelObject.id)
  const providerID = extractString(modelObject.providerID)
  if (!modelID) {
    return null
  }
  return providerID ? `${providerID}/${modelID}` : modelID
}

function extractProviderId(data: Record<string, unknown>, sessionModel: unknown): string | null {
  const directProvider = extractString(data.providerID) ?? extractString(data.providerId)
  if (directProvider) {
    return directProvider
  }
  const modelObject = parseJsonObject(data.model) ?? parseJsonObject(sessionModel)
  return extractString(modelObject?.providerID) ?? extractString(modelObject?.providerId)
}

function isOpenCodeGoProvider(providerId: string | null): boolean {
  return providerId?.toLowerCase() === 'opencode-go'
}

function extractCwd(data: Record<string, unknown>, row: OpenCodeUsageRow): string | null {
  const pathData = parseJsonObject(data.path)
  return (
    extractString(pathData?.cwd) ??
    extractString(row.directory) ??
    extractString(row.worktree) ??
    null
  )
}

function normalizeMillis(value: unknown): number | null {
  const numeric = ensureNumber(value)
  if (numeric <= 0) {
    return null
  }
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric
}

function extractTimestamp(data: Record<string, unknown>, row: OpenCodeUsageRow): string | null {
  const timeData = parseJsonObject(data.time)
  const millis =
    normalizeMillis(timeData?.completed) ??
    normalizeMillis(timeData?.created) ??
    normalizeMillis(row.time_updated) ??
    normalizeMillis(row.time_created)
  return millis ? new Date(millis).toISOString() : null
}

export function parseOpenCodeUsageRow(row: OpenCodeUsageRow): OpenCodeUsageParsedEvent | null {
  const data = parseJsonObject(row.data)
  if (!data) {
    return null
  }

  const tokens = parseJsonObject(data.tokens)
  if (!tokens) {
    return null
  }
  const cache = parseJsonObject(tokens.cache)
  const inputTokens = ensureNumber(tokens.input)
  const outputTokens = ensureNumber(tokens.output)
  const reasoningOutputTokens = ensureNumber(tokens.reasoning)
  const cachedInputTokens = ensureNumber(cache?.read)
  const totalTokens =
    ensureNumber(tokens.total) > 0
      ? ensureNumber(tokens.total)
      : inputTokens + outputTokens + reasoningOutputTokens + cachedInputTokens

  if (inputTokens + outputTokens + reasoningOutputTokens + cachedInputTokens + totalTokens <= 0) {
    return null
  }

  const timestamp = extractTimestamp(data, row)
  if (!timestamp) {
    return null
  }

  const providerId = extractProviderId(data, row.session_model)
  const rawCost = row.has_step_finish_parts
    ? extractFiniteNumber(row.cost_override)
    : extractFiniteNumber(data.cost)

  return {
    sessionId: row.session_id,
    timestamp,
    cwd: extractCwd(data, row),
    model: extractModelLabel(data, row.session_model),
    // Why: CodexBar only treats the OpenCode Go ledger as a supported local
    // cost source. Generic OpenCode rows still contribute tokens, but their
    // `cost` field is not a comparable provider-cost contract.
    estimatedCostUsd:
      isOpenCodeGoProvider(providerId) && rawCost !== null && rawCost >= 0 ? rawCost : null,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens
  }
}

function getDefaultProjectLabel(cwd: string | null): string {
  if (!cwd) {
    return 'Unknown location'
  }
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length >= 2) {
    return parts.slice(-2).join('/')
  }
  return parts.at(-1) ?? cwd
}

function localDayFromTimestamp(timestamp: string): string | null {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isContainingPath(candidatePath: string, targetPath: string): boolean {
  const useWin32 = looksLikeWindowsPath(candidatePath) || looksLikeWindowsPath(targetPath)
  const relativePath = useWin32
    ? win32.relative(candidatePath, targetPath)
    : posix.relative(candidatePath, targetPath)
  if (!relativePath) {
    return true
  }
  const isAbsoluteRelative = useWin32
    ? win32.isAbsolute(relativePath)
    : posix.isAbsolute(relativePath)
  const parentPrefix = useWin32 ? `..${win32.sep}` : `..${posix.sep}`
  // Why: `..name` is a valid child path; only `..` and `../...` escape.
  return (
    !isAbsoluteRelative &&
    relativePath !== '..' &&
    !relativePath.startsWith(parentPrefix) &&
    relativePath !== '.'
  )
}

async function buildWorktreesWithCanonicalPaths(
  worktrees: OpenCodeUsageWorktreeRef[]
): Promise<(OpenCodeUsageWorktreeRef & { canonicalPath: string })[]> {
  return canonicalizeUsageWorktreePaths(worktrees, canonicalizePath)
}

async function canonicalizePath(pathValue: string): Promise<string> {
  try {
    return normalizeFsPath(await realpath(pathValue))
  } catch {
    return normalizeFsPath(pathValue)
  }
}

function findContainingWorktree(
  cwd: string,
  worktrees: (OpenCodeUsageWorktreeRef & { canonicalPath: string })[]
): OpenCodeUsageWorktreeRef | null {
  const normalizedCwd = normalizeFsPath(cwd)
  for (const worktree of worktrees) {
    if (areWorktreePathsEqual(worktree.canonicalPath, normalizedCwd)) {
      return worktree
    }
    if (isContainingPath(worktree.canonicalPath, normalizedCwd)) {
      return worktree
    }
  }
  return null
}

export async function attributeOpenCodeUsageEvent(
  event: OpenCodeUsageParsedEvent,
  worktrees: (OpenCodeUsageWorktreeRef & { canonicalPath: string })[]
): Promise<OpenCodeUsageAttributedEvent | null> {
  const day = localDayFromTimestamp(event.timestamp)
  if (!day) {
    return null
  }

  let repoId: string | null = null
  let worktreeId: string | null = null
  let projectKey = 'unscoped'
  let projectLabel = getDefaultProjectLabel(event.cwd)

  if (event.cwd) {
    const worktree = findContainingWorktree(event.cwd, worktrees)
    if (worktree) {
      repoId = worktree.repoId
      worktreeId = worktree.worktreeId
      projectKey = `worktree:${worktree.worktreeId}`
      projectLabel = worktree.displayName
    } else {
      projectKey = `cwd:${normalizeComparablePath(event.cwd)}`
    }
  }

  return {
    ...event,
    day,
    projectKey,
    projectLabel,
    repoId,
    worktreeId
  }
}

function addCost(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null
  }
  return (left ?? 0) + (right ?? 0)
}

function mergeCost(
  left: number | null,
  right: number | null,
  leftTokens: number,
  rightTokens: number
): number | null {
  // Why: a null cost means that at least one token-bearing request has no
  // comparable price. Preserve that uncertainty while flattening requests
  // into sessions, days, and database projections.
  if ((leftTokens > 0 && left === null) || (rightTokens > 0 && right === null)) {
    return null
  }
  return addCost(left, right)
}

function createEmptySession(event: OpenCodeUsageAttributedEvent): OpenCodeUsageSession {
  return {
    sessionId: event.sessionId,
    firstTimestamp: event.timestamp,
    lastTimestamp: event.timestamp,
    primaryModel: event.model,
    hasMixedModels: false,
    primaryProjectLabel: event.projectLabel,
    hasMixedLocations: false,
    primaryWorktreeId: event.worktreeId,
    primaryRepoId: event.repoId,
    eventCount: 0,
    totalInputTokens: 0,
    totalCachedInputTokens: 0,
    totalOutputTokens: 0,
    totalReasoningOutputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null,
    locationBreakdown: [],
    modelBreakdown: [],
    locationModelBreakdown: []
  }
}

function createEmptyDailyAggregate(
  event: OpenCodeUsageAttributedEvent
): OpenCodeUsageDailyAggregate {
  return {
    day: event.day,
    model: event.model,
    projectKey: event.projectKey,
    projectLabel: event.projectLabel,
    repoId: event.repoId,
    worktreeId: event.worktreeId,
    eventCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null
  }
}

function mergeLocationBreakdown(
  target: OpenCodeUsageLocationBreakdown[],
  event: OpenCodeUsageAttributedEvent
): void {
  const existing = target.find((entry) => entry.locationKey === event.projectKey) ?? null
  if (existing) {
    const previousTokens = existing.totalTokens
    existing.eventCount++
    existing.inputTokens += event.inputTokens
    existing.cachedInputTokens += event.cachedInputTokens
    existing.outputTokens += event.outputTokens
    existing.reasoningOutputTokens += event.reasoningOutputTokens
    existing.totalTokens += event.totalTokens
    existing.estimatedCostUsd = mergeCost(
      existing.estimatedCostUsd,
      event.estimatedCostUsd,
      previousTokens,
      event.totalTokens
    )
    return
  }

  target.push({
    locationKey: event.projectKey,
    projectLabel: event.projectLabel,
    repoId: event.repoId,
    worktreeId: event.worktreeId,
    eventCount: 1,
    inputTokens: event.inputTokens,
    cachedInputTokens: event.cachedInputTokens,
    outputTokens: event.outputTokens,
    reasoningOutputTokens: event.reasoningOutputTokens,
    totalTokens: event.totalTokens,
    estimatedCostUsd: event.estimatedCostUsd
  })
}

function mergeModelBreakdown(
  target: OpenCodeUsageModelBreakdown[],
  event: OpenCodeUsageAttributedEvent
): void {
  const key = event.model ?? 'unknown'
  const existing = target.find((entry) => entry.modelKey === key) ?? null
  if (existing) {
    const previousTokens = existing.totalTokens
    existing.eventCount++
    existing.inputTokens += event.inputTokens
    existing.cachedInputTokens += event.cachedInputTokens
    existing.outputTokens += event.outputTokens
    existing.reasoningOutputTokens += event.reasoningOutputTokens
    existing.totalTokens += event.totalTokens
    existing.estimatedCostUsd = mergeCost(
      existing.estimatedCostUsd,
      event.estimatedCostUsd,
      previousTokens,
      event.totalTokens
    )
    return
  }

  target.push({
    modelKey: key,
    modelLabel: event.model ?? 'Unknown model',
    eventCount: 1,
    inputTokens: event.inputTokens,
    cachedInputTokens: event.cachedInputTokens,
    outputTokens: event.outputTokens,
    reasoningOutputTokens: event.reasoningOutputTokens,
    totalTokens: event.totalTokens,
    estimatedCostUsd: event.estimatedCostUsd
  })
}

function mergeLocationModelBreakdown(
  target: OpenCodeUsageLocationModelBreakdown[],
  event: OpenCodeUsageAttributedEvent
): void {
  const modelKey = event.model ?? 'unknown'
  const existing =
    target.find((entry) => entry.locationKey === event.projectKey && entry.modelKey === modelKey) ??
    null
  if (existing) {
    const previousTokens = existing.totalTokens
    existing.eventCount++
    existing.inputTokens += event.inputTokens
    existing.cachedInputTokens += event.cachedInputTokens
    existing.outputTokens += event.outputTokens
    existing.reasoningOutputTokens += event.reasoningOutputTokens
    existing.totalTokens += event.totalTokens
    existing.estimatedCostUsd = mergeCost(
      existing.estimatedCostUsd,
      event.estimatedCostUsd,
      previousTokens,
      event.totalTokens
    )
    return
  }

  target.push({
    locationKey: event.projectKey,
    modelKey,
    modelLabel: event.model ?? 'Unknown model',
    repoId: event.repoId,
    worktreeId: event.worktreeId,
    eventCount: 1,
    inputTokens: event.inputTokens,
    cachedInputTokens: event.cachedInputTokens,
    outputTokens: event.outputTokens,
    reasoningOutputTokens: event.reasoningOutputTokens,
    totalTokens: event.totalTokens,
    estimatedCostUsd: event.estimatedCostUsd
  })
}

function aggregateOpenCodeUsage(events: OpenCodeUsageAttributedEvent[]): {
  sessions: OpenCodeUsageSession[]
  dailyAggregates: OpenCodeUsageDailyAggregate[]
} {
  const sessionsById = new Map<string, OpenCodeUsageSession>()
  const dailyByKey = new Map<string, OpenCodeUsageDailyAggregate>()

  for (const event of events) {
    const session = sessionsById.get(event.sessionId) ?? createEmptySession(event)
    if (!sessionsById.has(event.sessionId)) {
      sessionsById.set(event.sessionId, session)
    }
    if (event.timestamp < session.firstTimestamp) {
      session.firstTimestamp = event.timestamp
    }
    if (event.timestamp >= session.lastTimestamp) {
      session.lastTimestamp = event.timestamp
    }
    const previousSessionTokens = session.totalTokens
    session.eventCount++
    session.totalInputTokens += event.inputTokens
    session.totalCachedInputTokens += event.cachedInputTokens
    session.totalOutputTokens += event.outputTokens
    session.totalReasoningOutputTokens += event.reasoningOutputTokens
    session.totalTokens += event.totalTokens
    session.estimatedCostUsd = mergeCost(
      session.estimatedCostUsd,
      event.estimatedCostUsd,
      previousSessionTokens,
      event.totalTokens
    )
    mergeLocationBreakdown(session.locationBreakdown, event)
    mergeModelBreakdown(session.modelBreakdown, event)
    mergeLocationModelBreakdown(session.locationModelBreakdown, event)

    const dailyKey = [event.day, event.model ?? 'unknown', event.projectKey].join('::')
    const daily = dailyByKey.get(dailyKey) ?? createEmptyDailyAggregate(event)
    if (!dailyByKey.has(dailyKey)) {
      dailyByKey.set(dailyKey, daily)
    }
    const previousDailyTokens = daily.totalTokens
    daily.eventCount++
    daily.inputTokens += event.inputTokens
    daily.cachedInputTokens += event.cachedInputTokens
    daily.outputTokens += event.outputTokens
    daily.reasoningOutputTokens += event.reasoningOutputTokens
    daily.totalTokens += event.totalTokens
    daily.estimatedCostUsd = mergeCost(
      daily.estimatedCostUsd,
      event.estimatedCostUsd,
      previousDailyTokens,
      event.totalTokens
    )
  }

  return {
    sessions: finalizeSessions(sessionsById),
    dailyAggregates: [...dailyByKey.values()].sort((left, right) =>
      left.day === right.day
        ? left.projectLabel.localeCompare(right.projectLabel)
        : left.day.localeCompare(right.day)
    )
  }
}

function finalizeSessions(sessionsById: Map<string, OpenCodeUsageSession>): OpenCodeUsageSession[] {
  for (const session of sessionsById.values()) {
    session.locationBreakdown.sort((left, right) => right.totalTokens - left.totalTokens)
    session.modelBreakdown.sort((left, right) => right.totalTokens - left.totalTokens)
    const primaryLocation = session.locationBreakdown[0] ?? null
    const primaryModel = session.modelBreakdown[0] ?? null
    session.primaryProjectLabel =
      session.locationBreakdown.length <= 1
        ? (primaryLocation?.projectLabel ?? 'Unknown location')
        : 'Multiple locations'
    session.hasMixedLocations = session.locationBreakdown.length > 1
    session.primaryWorktreeId = primaryLocation?.worktreeId ?? null
    session.primaryRepoId = primaryLocation?.repoId ?? null
    session.primaryModel =
      session.modelBreakdown.length <= 1 ? (primaryModel?.modelLabel ?? null) : 'Mixed models'
    session.hasMixedModels = session.modelBreakdown.length > 1
  }

  return [...sessionsById.values()].sort((left, right) =>
    right.lastTimestamp.localeCompare(left.lastTimestamp)
  )
}

function mergeSessions(
  target: Map<string, OpenCodeUsageSession>,
  sessions: OpenCodeUsageSession[]
): void {
  for (const session of sessions) {
    const existing = target.get(session.sessionId)
    if (!existing) {
      target.set(session.sessionId, structuredClone(session))
      continue
    }

    existing.firstTimestamp =
      session.firstTimestamp < existing.firstTimestamp
        ? session.firstTimestamp
        : existing.firstTimestamp
    existing.lastTimestamp =
      session.lastTimestamp > existing.lastTimestamp
        ? session.lastTimestamp
        : existing.lastTimestamp
    const previousSessionTokens = existing.totalTokens
    existing.eventCount += session.eventCount
    existing.totalInputTokens += session.totalInputTokens
    existing.totalCachedInputTokens += session.totalCachedInputTokens
    existing.totalOutputTokens += session.totalOutputTokens
    existing.totalReasoningOutputTokens += session.totalReasoningOutputTokens
    existing.totalTokens += session.totalTokens
    existing.estimatedCostUsd = mergeCost(
      existing.estimatedCostUsd,
      session.estimatedCostUsd,
      previousSessionTokens,
      session.totalTokens
    )

    for (const location of session.locationBreakdown) {
      const existingLocation =
        existing.locationBreakdown.find((entry) => entry.locationKey === location.locationKey) ??
        null
      if (existingLocation) {
        const previousLocationTokens = existingLocation.totalTokens
        existingLocation.eventCount += location.eventCount
        existingLocation.inputTokens += location.inputTokens
        existingLocation.cachedInputTokens += location.cachedInputTokens
        existingLocation.outputTokens += location.outputTokens
        existingLocation.reasoningOutputTokens += location.reasoningOutputTokens
        existingLocation.totalTokens += location.totalTokens
        existingLocation.estimatedCostUsd = mergeCost(
          existingLocation.estimatedCostUsd,
          location.estimatedCostUsd,
          previousLocationTokens,
          location.totalTokens
        )
      } else {
        existing.locationBreakdown.push({ ...location })
      }
    }

    for (const model of session.modelBreakdown) {
      const existingModel =
        existing.modelBreakdown.find((entry) => entry.modelKey === model.modelKey) ?? null
      if (existingModel) {
        const previousModelTokens = existingModel.totalTokens
        existingModel.eventCount += model.eventCount
        existingModel.inputTokens += model.inputTokens
        existingModel.cachedInputTokens += model.cachedInputTokens
        existingModel.outputTokens += model.outputTokens
        existingModel.reasoningOutputTokens += model.reasoningOutputTokens
        existingModel.totalTokens += model.totalTokens
        existingModel.estimatedCostUsd = mergeCost(
          existingModel.estimatedCostUsd,
          model.estimatedCostUsd,
          previousModelTokens,
          model.totalTokens
        )
      } else {
        existing.modelBreakdown.push({ ...model })
      }
    }

    for (const locationModel of session.locationModelBreakdown) {
      const existingLocationModel =
        existing.locationModelBreakdown.find(
          (entry) =>
            entry.locationKey === locationModel.locationKey &&
            entry.modelKey === locationModel.modelKey
        ) ?? null
      if (existingLocationModel) {
        const previousLocationModelTokens = existingLocationModel.totalTokens
        existingLocationModel.eventCount += locationModel.eventCount
        existingLocationModel.inputTokens += locationModel.inputTokens
        existingLocationModel.cachedInputTokens += locationModel.cachedInputTokens
        existingLocationModel.outputTokens += locationModel.outputTokens
        existingLocationModel.reasoningOutputTokens += locationModel.reasoningOutputTokens
        existingLocationModel.totalTokens += locationModel.totalTokens
        existingLocationModel.estimatedCostUsd = mergeCost(
          existingLocationModel.estimatedCostUsd,
          locationModel.estimatedCostUsd,
          previousLocationModelTokens,
          locationModel.totalTokens
        )
      } else {
        existing.locationModelBreakdown.push({ ...locationModel })
      }
    }
  }
}

function mergeDailyAggregates(
  target: Map<string, OpenCodeUsageDailyAggregate>,
  dailyAggregates: OpenCodeUsageDailyAggregate[]
): void {
  for (const aggregate of dailyAggregates) {
    const key = [aggregate.day, aggregate.model ?? 'unknown', aggregate.projectKey].join('::')
    const existing = target.get(key)
    if (!existing) {
      target.set(key, { ...aggregate })
      continue
    }
    const previousTokens = existing.totalTokens
    existing.eventCount += aggregate.eventCount
    existing.inputTokens += aggregate.inputTokens
    existing.cachedInputTokens += aggregate.cachedInputTokens
    existing.outputTokens += aggregate.outputTokens
    existing.reasoningOutputTokens += aggregate.reasoningOutputTokens
    existing.totalTokens += aggregate.totalTokens
    existing.estimatedCostUsd = mergeCost(
      existing.estimatedCostUsd,
      aggregate.estimatedCostUsd,
      previousTokens,
      aggregate.totalTokens
    )
  }
}

export async function parseOpenCodeUsageDatabase(
  dbPath: string,
  worktrees: (OpenCodeUsageWorktreeRef & { canonicalPath: string })[],
  options: { claimSession?: (sessionId: string) => boolean } = {}
): Promise<OpenCodeUsagePersistedDatabase> {
  const processedDatabase = await getProcessedDatabaseInfo(dbPath)
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    db.pragma('query_only = ON')
    const events: OpenCodeUsageAttributedEvent[] = []
    const claimedBySessionId = new Map<string, boolean>()
    let hasDeferredClaims = false
    for (const row of selectUsageRows(db)) {
      const parsed = parseOpenCodeUsageRow(row)
      if (!parsed) {
        continue
      }
      // Why: a stale sibling copy of opencode.db carries the same sessions, so
      // each session must be counted from exactly one database (#8006).
      let owned = claimedBySessionId.get(parsed.sessionId)
      if (owned === undefined) {
        owned = options.claimSession ? options.claimSession(parsed.sessionId) : true
        claimedBySessionId.set(parsed.sessionId, owned)
      }
      if (!owned) {
        hasDeferredClaims = true
        continue
      }
      const attributed = await attributeOpenCodeUsageEvent(parsed, worktrees)
      if (attributed) {
        events.push(attributed)
      }
    }
    return {
      ...processedDatabase,
      ...aggregateOpenCodeUsage(events),
      ownedSessionIds: [...claimedBySessionId.entries()]
        .filter(([, owned]) => owned)
        .map(([sessionId]) => sessionId),
      hasDeferredClaims
    }
  } finally {
    db.close()
  }
}

export async function scanOpenCodeUsageDatabases(
  worktrees: OpenCodeUsageWorktreeRef[],
  previousProcessedDatabases: OpenCodeUsagePersistedDatabase[]
): Promise<{
  processedDatabases: OpenCodeUsagePersistedDatabase[]
  sessions: OpenCodeUsageSession[]
  dailyAggregates: OpenCodeUsageDailyAggregate[]
}> {
  const dbPaths = await listOpenCodeDatabases()
  const previousByPath = new Map(
    previousProcessedDatabases.map((database) => [database.path, database])
  )
  const worktreesWithCanonicalPaths = await buildWorktreesWithCanonicalPaths(worktrees)

  const currentPaths = new Set(dbPaths)
  // Why: when a database that owned sessions is deleted, remaining siblings
  // still contain those sessions but their caches record them as unowned.
  // Only databases that previously deferred claims can reclaim.
  const lostOwnerPath = previousProcessedDatabases.some(
    (database) =>
      !currentPaths.has(database.path) &&
      Array.isArray(database.ownedSessionIds) &&
      database.ownedSessionIds.length > 0
  )

  const reusedByPath = new Map<string, OpenCodeUsagePersistedDatabase>()
  const pathsToParse: string[] = []
  for (const dbPath of dbPaths) {
    const databaseInfo = await getProcessedDatabaseInfo(dbPath)
    const previous = previousByPath.get(dbPath)
    // When an owner disappears, only deferred-claim databases need reparse.
    const mustReclaimDeferred = lostOwnerPath && previous?.hasDeferredClaims !== false
    const canReuse =
      !mustReclaimDeferred &&
      previous &&
      previous.mtimeMs === databaseInfo.mtimeMs &&
      previous.size === databaseInfo.size &&
      Array.isArray(previous.ownedSessionIds) &&
      typeof previous.hasDeferredClaims === 'boolean'
    if (canReuse) {
      reusedByPath.set(dbPath, previous)
    } else {
      pathsToParse.push(dbPath)
    }
  }

  // Why: a sticky backup claim from a scan where opencode.db was missing would
  // otherwise freeze a still-growing session at the backup snapshot when the
  // live db reappears. Reparse a lower-priority sibling only when it still owns
  // sessions a higher-priority path could reclaim; a sibling that owns nothing
  // (the common case once the live db has claimed every shared session) has no
  // claim to give back, so reparsing it every time the live db changes is pure
  // work.
  const demotedReusePaths: string[] = []
  for (const [dbPath, reused] of reusedByPath) {
    if ((reused.ownedSessionIds?.length ?? 0) === 0) {
      continue
    }
    const higherPriorityParsing = pathsToParse.some(
      (candidate) => compareOpenCodeClaimPriority(candidate, dbPath) < 0
    )
    if (higherPriorityParsing) {
      demotedReusePaths.push(dbPath)
    }
  }
  for (const dbPath of demotedReusePaths) {
    reusedByPath.delete(dbPath)
    pathsToParse.push(dbPath)
  }

  // Why: `opencode-*.db` siblings are typically stale copies of `opencode.db`
  // (backups), so mergeSessions would double every duplicated session (#8006).
  // Each session is counted from exactly one database. The canonical live db
  // claims first so a stale backup cannot freeze a still-growing session at
  // its snapshot totals; cached databases keep the claims they persisted.
  const sessionOwnerById = new Map<string, string>()
  for (const dbPath of [...reusedByPath.keys()].sort(compareOpenCodeClaimPriority)) {
    const previous = reusedByPath.get(dbPath)
    for (const sessionId of previous?.ownedSessionIds ?? []) {
      if (!sessionOwnerById.has(sessionId)) {
        sessionOwnerById.set(sessionId, dbPath)
      }
    }
  }

  const parsedByPath = new Map<string, OpenCodeUsagePersistedDatabase>()
  const orderedPathsToParse = [...pathsToParse].sort(compareOpenCodeClaimPriority)
  for (const [index, dbPath] of orderedPathsToParse.entries()) {
    const processed = await parseOpenCodeUsageDatabase(dbPath, worktreesWithCanonicalPaths, {
      claimSession: (sessionId) => {
        const owner = sessionOwnerById.get(sessionId)
        if (owner !== undefined && owner !== dbPath) {
          return false
        }
        sessionOwnerById.set(sessionId, dbPath)
        return true
      }
    })
    parsedByPath.set(dbPath, processed)

    if ((index + 1) % YIELD_EVERY_DATABASES === 0) {
      await yieldToEventLoop()
    }
  }

  const processedDatabases: OpenCodeUsagePersistedDatabase[] = []
  const sessionsById = new Map<string, OpenCodeUsageSession>()
  const dailyByKey = new Map<string, OpenCodeUsageDailyAggregate>()
  for (const dbPath of dbPaths) {
    const processed = reusedByPath.get(dbPath) ?? parsedByPath.get(dbPath)
    if (!processed) {
      continue
    }
    processedDatabases.push(processed)
    mergeSessions(sessionsById, processed.sessions)
    mergeDailyAggregates(dailyByKey, processed.dailyAggregates)
  }

  return {
    processedDatabases,
    sessions: finalizeSessions(sessionsById),
    dailyAggregates: [...dailyByKey.values()].sort((left, right) =>
      left.day === right.day
        ? left.projectLabel.localeCompare(right.projectLabel)
        : left.day.localeCompare(right.day)
    )
  }
}

export function createWorktreeRefs(
  repos: Repo[],
  worktreesByRepo: Map<string, { path: string; worktreeId: string; displayName: string }[]>
): OpenCodeUsageWorktreeRef[] {
  const refs: OpenCodeUsageWorktreeRef[] = []
  for (const repo of repos) {
    for (const worktree of worktreesByRepo.get(repo.id) ?? []) {
      refs.push({
        repoId: repo.id,
        worktreeId: worktree.worktreeId,
        path: worktree.path,
        displayName: worktree.displayName
      })
    }
  }
  return refs
}
