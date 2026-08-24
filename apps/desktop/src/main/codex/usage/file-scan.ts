import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import { createInterface } from 'node:readline'

import { mergeDailyAggregates, mergeSessions } from './aggregate-merge'
import { CodexUsageOwnershipIndex } from './ownership-index'
import { loadCodexPrioritySnapshot, type CodexPrioritySnapshot } from './priority'
import { parseCodexUsageRecord } from './record-parser'
import {
  getLegacySourceSkipBytesByPath,
  getProcessedFileInfo,
  listCodexSessionFiles,
  yieldToEventLoop
} from './session-discovery'
import type {
  CodexUsageAttributedEvent,
  CodexUsageDailyAggregate,
  CodexUsagePersistedFile,
  CodexUsageSession
} from './types'
import { aggregateCodexUsage, finalizeSessions } from './usage-aggregation'
import type { CodexUsageParseContext, CodexUsageWorktreeRef } from './usage-record-model'
import { attributeCodexUsageEvent, buildWorktreesWithCanonicalPaths } from './worktree-attribution'

const YIELD_EVERY_FILES = 10

export async function parseCodexUsageFile(
  filePath: string,
  worktrees: (CodexUsageWorktreeRef & { canonicalPath: string })[],
  options: {
    skipInitialBytes?: number
    claimEventKey?: (eventKey: string) => boolean
    prioritySnapshot?: CodexPrioritySnapshot
    worktreeByCwd?: Map<string, CodexUsageWorktreeRef | null>
  } = {}
): Promise<CodexUsagePersistedFile> {
  const prioritySnapshot = options.prioritySnapshot ?? loadCodexPrioritySnapshot()
  const processedFile = await getProcessedFileInfo(filePath)
  const lines = createInterface({
    input: createReadStream(filePath, {
      encoding: 'utf-8',
      start: options.skipInitialBytes ?? 0
    }),
    crlfDelay: Infinity
  })
  const events: CodexUsageAttributedEvent[] = []
  const context: CodexUsageParseContext = {
    sessionId: basename(filePath, '.jsonl'),
    sessionCwd: null,
    currentCwd: null,
    currentModel: null,
    currentTurnId: null,
    previousTotals: null,
    sawSessionMeta: false,
    suppressingForkCopies: false,
    forkCopyAnchorMs: 0,
    // Why: suffix-only legacy copy parsing lacks the copied prefix context. A
    // leading total-only snapshot is a baseline, not the suffix's billable delta.
    totalOnlyBaselinePending: (options.skipInitialBytes ?? 0) > 0
  }

  let hasDeferredClaims = false
  for await (const line of lines) {
    const parsed = parseCodexUsageRecord(line, context)
    if (!parsed) {
      continue
    }
    // Why: fork/resume rollouts start with a copied prefix of the parent file.
    // Events another file already owns are dropped here, but the record still
    // advanced context.previousTotals above, so later deltas stay correct.
    if (options.claimEventKey && !options.claimEventKey(parsed.eventKey)) {
      hasDeferredClaims = true
      continue
    }
    const attributed = await attributeCodexUsageEvent(parsed, worktrees, options.worktreeByCwd)
    if (attributed) {
      events.push(attributed)
    }
  }

  return {
    ...processedFile,
    ...aggregateCodexUsage(events, prioritySnapshot),
    hasDeferredClaims,
    priorityFingerprint: prioritySnapshot.fingerprint
  }
}

export async function scanCodexUsageFiles(
  worktrees: CodexUsageWorktreeRef[],
  previousProcessedFiles: CodexUsagePersistedFile[],
  previousOwnershipGeneration: string | null,
  ownershipDatabasePath: string
): Promise<{
  processedFiles: CodexUsagePersistedFile[]
  sessions: CodexUsageSession[]
  dailyAggregates: CodexUsageDailyAggregate[]
  ownershipGeneration: string
}> {
  const prioritySnapshot = loadCodexPrioritySnapshot()
  const files = await listCodexSessionFiles()
  const worktreesWithCanonicalPaths = await buildWorktreesWithCanonicalPaths(worktrees)
  const legacySourceSkipBytesByPath = getLegacySourceSkipBytesByPath(files)
  const ownershipIndex = new CodexUsageOwnershipIndex(ownershipDatabasePath)
  const canReuseOwnership =
    previousOwnershipGeneration !== null &&
    ownershipIndex.getGeneration() === previousOwnershipGeneration
  const reusablePreviousFiles = canReuseOwnership ? previousProcessedFiles : []
  const previousByPath = new Map(reusablePreviousFiles.map((file) => [file.path, file]))

  ownershipIndex.begin(!canReuseOwnership)
  try {
    return await scanCodexUsageFilesWithIndex({
      files,
      legacySourceSkipBytesByPath,
      ownershipIndex,
      previousByPath,
      previousProcessedFiles: reusablePreviousFiles,
      prioritySnapshot,
      worktreesWithCanonicalPaths
    })
  } catch (error) {
    ownershipIndex.rollback()
    throw error
  } finally {
    ownershipIndex.close()
  }
}

async function scanCodexUsageFilesWithIndex(args: {
  files: string[]
  legacySourceSkipBytesByPath: Map<string, number>
  ownershipIndex: CodexUsageOwnershipIndex
  previousByPath: Map<string, CodexUsagePersistedFile>
  previousProcessedFiles: CodexUsagePersistedFile[]
  prioritySnapshot: CodexPrioritySnapshot
  worktreesWithCanonicalPaths: (CodexUsageWorktreeRef & { canonicalPath: string })[]
}): Promise<{
  processedFiles: CodexUsagePersistedFile[]
  sessions: CodexUsageSession[]
  dailyAggregates: CodexUsageDailyAggregate[]
  ownershipGeneration: string
}> {
  const {
    files,
    legacySourceSkipBytesByPath,
    ownershipIndex,
    previousByPath,
    previousProcessedFiles,
    prioritySnapshot,
    worktreesWithCanonicalPaths
  } = args

  const currentPaths = new Set(files)
  // Why: when a rollout that owned event keys is deleted, remaining forks still
  // contain those records but their caches record them as unowned. Only files
  // that previously deferred claims can reclaim, so invalidate those — not the
  // entire rollout corpus.
  let lostOwnerPath = false
  for (const file of previousProcessedFiles) {
    if (!currentPaths.has(file.path)) {
      lostOwnerPath ||= ownershipIndex.removeFile(file.path)
    }
  }

  const reusedByPath = new Map<string, CodexUsagePersistedFile>()
  const pathsToParse: string[] = []
  for (const [index, filePath] of files.entries()) {
    const legacySourceSkipBytes = legacySourceSkipBytesByPath.get(filePath) ?? 0
    const fileInfo = await getProcessedFileInfo(filePath)
    const previous = previousByPath.get(filePath)
    // When an owner disappears, only deferred-claim files need reparse.
    const mustReclaimDeferred = lostOwnerPath && previous?.hasDeferredClaims !== false
    const canReuse =
      !mustReclaimDeferred &&
      legacySourceSkipBytes === 0 &&
      previous &&
      previous.mtimeMs === fileInfo.mtimeMs &&
      previous.size === fileInfo.size &&
      typeof previous.hasDeferredClaims === 'boolean' &&
      previous.priorityFingerprint === prioritySnapshot.fingerprint
    if (canReuse) {
      reusedByPath.set(filePath, previous)
    } else {
      pathsToParse.push(filePath)
    }
    if ((index + 1) % YIELD_EVERY_FILES === 0) {
      await yieldToEventLoop()
    }
  }

  const parsedByPath = new Map<string, CodexUsagePersistedFile>()
  const worktreeByCwd = new Map<string, CodexUsageWorktreeRef | null>()
  for (const [index, filePath] of pathsToParse.entries()) {
    const ownershipFileId = ownershipIndex.prepareFile(filePath)
    const processed = await parseCodexUsageFile(filePath, worktreesWithCanonicalPaths, {
      skipInitialBytes: legacySourceSkipBytesByPath.get(filePath) ?? 0,
      claimEventKey: (eventKey) => ownershipIndex.claimEvent(ownershipFileId, eventKey),
      prioritySnapshot,
      worktreeByCwd
    })
    parsedByPath.set(filePath, processed)

    // Why: Codex session history can grow large, and scans run on the Electron
    // main process. Yield regularly so opening Settings does not stall while
    // a background refresh walks old JSONL files.
    if ((index + 1) % YIELD_EVERY_FILES === 0) {
      await yieldToEventLoop()
    }
  }

  const processedFiles: CodexUsagePersistedFile[] = []
  const sessionsById = new Map<string, CodexUsageSession>()
  const dailyByKey = new Map<string, CodexUsageDailyAggregate>()
  for (const filePath of files) {
    const processed = reusedByPath.get(filePath) ?? parsedByPath.get(filePath)
    if (!processed) {
      continue
    }
    processedFiles.push(processed)
    mergeSessions(sessionsById, processed.sessions)
    mergeDailyAggregates(dailyByKey, processed.dailyAggregates)
  }

  const ownershipGeneration = ownershipIndex.commit()
  return {
    processedFiles,
    sessions: finalizeSessions(sessionsById),
    dailyAggregates: [...dailyByKey.values()].sort((left, right) =>
      left.day === right.day
        ? left.projectLabel.localeCompare(right.projectLabel)
        : left.day.localeCompare(right.day)
    ),
    ownershipGeneration
  }
}
