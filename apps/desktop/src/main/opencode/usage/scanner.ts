import { yieldToEventLoop } from '@yiru/workbench-model/ui'
import Database from '~main/sqlite/sync-database'
import type { Repo } from '~shared/types'

import { aggregateOpenCodeUsage } from './scanner-aggregation'
import {
  attributeOpenCodeUsageEvent,
  buildWorktreesWithCanonicalPaths,
  type CanonicalOpenCodeUsageWorktree,
  type OpenCodeUsageWorktreeRef
} from './scanner-attribution'
import {
  compareOpenCodeClaimPriority,
  getProcessedDatabaseInfo,
  listOpenCodeDatabases,
  selectOpenCodeUsageRows
} from './scanner-databases'
import { parseOpenCodeUsageRow } from './scanner-events'
import {
  finalizeOpenCodeUsageProjection,
  mergeOpenCodeUsageDailyAggregates,
  mergeOpenCodeUsageSessions
} from './scanner-merge'
import type {
  OpenCodeUsageAttributedEvent,
  OpenCodeUsageDailyAggregate,
  OpenCodeUsagePersistedDatabase,
  OpenCodeUsageSession
} from './types'

export { attributeOpenCodeUsageEvent, listOpenCodeDatabases, parseOpenCodeUsageRow }
export type { OpenCodeUsageWorktreeRef }

const YIELD_EVERY_DATABASES = 2

export async function parseOpenCodeUsageDatabase(
  dbPath: string,
  worktrees: CanonicalOpenCodeUsageWorktree[],
  options: { claimSession?: (sessionId: string) => boolean } = {}
): Promise<OpenCodeUsagePersistedDatabase> {
  const processedDatabase = await getProcessedDatabaseInfo(dbPath)
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    db.pragma('query_only = ON')
    const events: OpenCodeUsageAttributedEvent[] = []
    const claimedBySessionId = new Map<string, boolean>()
    let hasDeferredClaims = false
    for (const row of selectOpenCodeUsageRows(db)) {
      const parsed = parseOpenCodeUsageRow(row)
      if (!parsed) {
        continue
      }
      // Why: sibling database copies can contain the same session, which must be counted once.
      let owned = claimedBySessionId.get(parsed.sessionId)
      if (owned === undefined) {
        owned = options.claimSession?.(parsed.sessionId) ?? true
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

function shouldReclaimDeferredSessions(
  databases: OpenCodeUsagePersistedDatabase[],
  currentPaths: Set<string>
): boolean {
  return databases.some(
    (database) =>
      !currentPaths.has(database.path) &&
      Array.isArray(database.ownedSessionIds) &&
      database.ownedSessionIds.length > 0
  )
}

async function partitionDatabasePaths(
  dbPaths: string[],
  previousByPath: Map<string, OpenCodeUsagePersistedDatabase>,
  mustReclaim: boolean
): Promise<{
  reusedByPath: Map<string, OpenCodeUsagePersistedDatabase>
  pathsToParse: string[]
}> {
  const reusedByPath = new Map<string, OpenCodeUsagePersistedDatabase>()
  const pathsToParse: string[] = []
  for (const dbPath of dbPaths) {
    const info = await getProcessedDatabaseInfo(dbPath)
    const previous = previousByPath.get(dbPath)
    const mustReclaimDeferred = mustReclaim && previous?.hasDeferredClaims !== false
    const canReuse =
      !mustReclaimDeferred &&
      previous &&
      previous.mtimeMs === info.mtimeMs &&
      previous.size === info.size &&
      Array.isArray(previous.ownedSessionIds) &&
      typeof previous.hasDeferredClaims === 'boolean'
    if (canReuse) {
      reusedByPath.set(dbPath, previous)
    } else {
      pathsToParse.push(dbPath)
    }
  }
  return { reusedByPath, pathsToParse }
}

function demoteStaleOwners(
  reusedByPath: Map<string, OpenCodeUsagePersistedDatabase>,
  pathsToParse: string[]
): void {
  const demotedPaths: string[] = []
  for (const [dbPath, reused] of reusedByPath) {
    if ((reused.ownedSessionIds?.length ?? 0) === 0) {
      continue
    }
    if (pathsToParse.some((candidate) => compareOpenCodeClaimPriority(candidate, dbPath) < 0)) {
      demotedPaths.push(dbPath)
    }
  }
  // Why: a returning live DB must reclaim sessions previously owned by a stale backup snapshot.
  for (const dbPath of demotedPaths) {
    reusedByPath.delete(dbPath)
    pathsToParse.push(dbPath)
  }
}

function buildSessionOwners(
  reusedByPath: Map<string, OpenCodeUsagePersistedDatabase>
): Map<string, string> {
  const sessionOwnerById = new Map<string, string>()
  for (const dbPath of [...reusedByPath.keys()].sort(compareOpenCodeClaimPriority)) {
    for (const sessionId of reusedByPath.get(dbPath)?.ownedSessionIds ?? []) {
      if (!sessionOwnerById.has(sessionId)) {
        sessionOwnerById.set(sessionId, dbPath)
      }
    }
  }
  return sessionOwnerById
}

async function parseChangedDatabases(
  pathsToParse: string[],
  worktrees: CanonicalOpenCodeUsageWorktree[],
  sessionOwnerById: Map<string, string>
): Promise<Map<string, OpenCodeUsagePersistedDatabase>> {
  const parsedByPath = new Map<string, OpenCodeUsagePersistedDatabase>()
  const orderedPaths = [...pathsToParse].sort(compareOpenCodeClaimPriority)
  for (const [index, dbPath] of orderedPaths.entries()) {
    const processed = await parseOpenCodeUsageDatabase(dbPath, worktrees, {
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
  return parsedByPath
}

export async function scanOpenCodeUsageDatabases(
  worktrees: OpenCodeUsageWorktreeRef[],
  previousDatabases: OpenCodeUsagePersistedDatabase[]
): Promise<{
  processedDatabases: OpenCodeUsagePersistedDatabase[]
  sessions: OpenCodeUsageSession[]
  dailyAggregates: OpenCodeUsageDailyAggregate[]
}> {
  const dbPaths = await listOpenCodeDatabases()
  const previousByPath = new Map(previousDatabases.map((database) => [database.path, database]))
  const canonicalWorktrees = await buildWorktreesWithCanonicalPaths(worktrees)
  const mustReclaim = shouldReclaimDeferredSessions(previousDatabases, new Set(dbPaths))
  const { reusedByPath, pathsToParse } = await partitionDatabasePaths(
    dbPaths,
    previousByPath,
    mustReclaim
  )
  demoteStaleOwners(reusedByPath, pathsToParse)
  const sessionOwnerById = buildSessionOwners(reusedByPath)
  const parsedByPath = await parseChangedDatabases(
    pathsToParse,
    canonicalWorktrees,
    sessionOwnerById
  )
  const processedDatabases: OpenCodeUsagePersistedDatabase[] = []
  const sessionsById = new Map<string, OpenCodeUsageSession>()
  const dailyByKey = new Map<string, OpenCodeUsageDailyAggregate>()
  for (const dbPath of dbPaths) {
    const processed = reusedByPath.get(dbPath) ?? parsedByPath.get(dbPath)
    if (!processed) {
      continue
    }
    processedDatabases.push(processed)
    mergeOpenCodeUsageSessions(sessionsById, processed.sessions)
    mergeOpenCodeUsageDailyAggregates(dailyByKey, processed.dailyAggregates)
  }
  return { processedDatabases, ...finalizeOpenCodeUsageProjection(sessionsById, dailyByKey) }
}

export function createWorktreeRefs(
  repos: Repo[],
  worktreesByRepo: Map<string, { path: string; worktreeId: string; displayName: string }[]>
): OpenCodeUsageWorktreeRef[] {
  return repos.flatMap((repo) =>
    (worktreesByRepo.get(repo.id) ?? []).map((worktree) => ({
      repoId: repo.id,
      worktreeId: worktree.worktreeId,
      path: worktree.path,
      displayName: worktree.displayName
    }))
  )
}
