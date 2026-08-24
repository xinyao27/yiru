import { yieldToEventLoop } from '@yiru/workbench-model/ui'

import {
  aggregateClaudeUsage,
  finalizeClaudeDailyAggregates,
  finalizeClaudeSessions,
  mergeClaudeDailyAggregates,
  mergeClaudeSessions
} from './aggregation'
import { attributeClaudeUsageTurns, buildWorktreeLookup } from './attribution'
import type { ClaudeUsageWorktreeRef } from './attribution'
import { getProcessedFileStat, listClaudeTranscriptFiles } from './transcript-discovery'
import {
  readClaudeUsageScanFile,
  stripClaudeSourceMetadata,
  type ClaudeUsageParsedSourceTurn
} from './transcript-parser'
import type {
  ClaudeUsageDailyAggregate,
  ClaudeUsageParsedTurn,
  ClaudeUsagePersistedFile,
  ClaudeUsageSession
} from './types'

export { aggregateClaudeUsage } from './aggregation'
export {
  attributeClaudeUsageTurns,
  buildWorktreeLookup,
  createWorktreeRefs,
  getDefaultWorktreeLabel,
  getSessionProjectLabel
} from './attribution'
export type { ClaudeUsageWorktreeRef } from './attribution'
export { getProcessedFileInfo, listClaudeTranscriptFiles } from './transcript-discovery'

const FILE_SCAN_BATCH_SIZE = 4

export async function scanClaudeUsageFiles(
  worktrees: ClaudeUsageWorktreeRef[],
  previousProcessedFiles: ClaudeUsagePersistedFile[] = []
): Promise<{
  processedFiles: ClaudeUsagePersistedFile[]
  sessions: ClaudeUsageSession[]
  dailyAggregates: ClaudeUsageDailyAggregate[]
}> {
  const files = await listClaudeTranscriptFiles()
  const previousByPath = new Map(previousProcessedFiles.map((file) => [file.path, file]))
  const worktreeLookup = await buildWorktreeLookup(worktrees)
  const hasLostOwner = hasLostDedupeOwner(files, previousProcessedFiles)
  const { pathsToParse, reusedByPath } = await classifyTranscriptFiles(
    files,
    previousByPath,
    hasLostOwner
  )
  const ownerByDedupeKey = collectCachedDedupeOwners(reusedByPath)
  const parsedByPath = await parseChangedFiles(pathsToParse, ownerByDedupeKey, worktreeLookup)
  return combineProcessedFiles(files, reusedByPath, parsedByPath)
}

function hasLostDedupeOwner(
  files: string[],
  previousProcessedFiles: ClaudeUsagePersistedFile[]
): boolean {
  const currentPaths = new Set(files)
  return previousProcessedFiles.some(
    (file) =>
      !currentPaths.has(file.path) &&
      Array.isArray(file.ownedDedupeKeys) &&
      file.ownedDedupeKeys.length > 0
  )
}

async function classifyTranscriptFiles(
  files: string[],
  previousByPath: Map<string, ClaudeUsagePersistedFile>,
  hasLostOwner: boolean
): Promise<{
  pathsToParse: string[]
  reusedByPath: Map<string, ClaudeUsagePersistedFile>
}> {
  const reusedByPath = new Map<string, ClaudeUsagePersistedFile>()
  const pathsToParse: string[] = []
  for (let index = 0; index < files.length; index += FILE_SCAN_BATCH_SIZE) {
    const batch = files.slice(index, index + FILE_SCAN_BATCH_SIZE)
    const reusable = await Promise.all(
      batch.map(async (filePath) => {
        const fileInfo = await getProcessedFileStat(filePath)
        const previous = previousByPath.get(filePath)
        const mustReclaimDeferred = hasLostOwner && previous?.hasDeferredClaims !== false
        return !mustReclaimDeferred &&
          previous?.mtimeMs === fileInfo.mtimeMs &&
          previous.size === fileInfo.size &&
          Array.isArray(previous.sessions) &&
          Array.isArray(previous.dailyAggregates) &&
          Array.isArray(previous.ownedDedupeKeys) &&
          typeof previous.hasDeferredClaims === 'boolean'
          ? previous
          : null
      })
    )
    for (const [batchIndex, previous] of reusable.entries()) {
      const filePath = batch[batchIndex]
      if (previous) {
        reusedByPath.set(filePath, previous)
      } else {
        pathsToParse.push(filePath)
      }
    }
    if (index + batch.length < files.length) {
      await yieldToEventLoop()
    }
  }
  return { pathsToParse, reusedByPath }
}

function collectCachedDedupeOwners(
  reusedByPath: Map<string, ClaudeUsagePersistedFile>
): Map<string, string> {
  const ownerByDedupeKey = new Map<string, string>()
  for (const [filePath, previous] of reusedByPath) {
    for (const dedupeKey of previous.ownedDedupeKeys) {
      if (!ownerByDedupeKey.has(dedupeKey)) {
        ownerByDedupeKey.set(dedupeKey, filePath)
      }
    }
  }
  return ownerByDedupeKey
}

async function parseChangedFiles(
  pathsToParse: string[],
  ownerByDedupeKey: Map<string, string>,
  worktreeLookup: Map<string, ClaudeUsageWorktreeRef>
): Promise<Map<string, ClaudeUsagePersistedFile>> {
  const parsedByPath = new Map<string, ClaudeUsagePersistedFile>()
  for (let index = 0; index < pathsToParse.length; index += FILE_SCAN_BATCH_SIZE) {
    const batch = pathsToParse.slice(index, index + FILE_SCAN_BATCH_SIZE)
    const reads = await Promise.all(batch.map(readClaudeUsageScanFile))
    for (const [batchIndex, filePath] of batch.entries()) {
      const { processedFile, turns } = reads[batchIndex]
      const ownership = claimTurns(filePath, turns, ownerByDedupeKey)
      const attributed = await attributeClaudeUsageTurns(ownership.turns, worktreeLookup)
      parsedByPath.set(filePath, {
        ...processedFile,
        ...aggregateClaudeUsage(attributed),
        ownedDedupeKeys: ownership.ownedDedupeKeys,
        hasDeferredClaims: ownership.hasDeferredClaims
      })
    }
    if (index + batch.length < pathsToParse.length) {
      await yieldToEventLoop()
    }
  }
  return parsedByPath
}

function claimTurns(
  filePath: string,
  sourceTurns: ClaudeUsageParsedSourceTurn[],
  ownerByDedupeKey: Map<string, string>
): {
  turns: ClaudeUsageParsedTurn[]
  ownedDedupeKeys: string[]
  hasDeferredClaims: boolean
} {
  const turns: ClaudeUsageParsedTurn[] = []
  const ownedDedupeKeys: string[] = []
  let hasDeferredClaims = false
  for (const turn of sourceTurns) {
    if (turn.dedupeKey) {
      const owner = ownerByDedupeKey.get(turn.dedupeKey)
      if (owner !== undefined && owner !== filePath) {
        hasDeferredClaims = true
        continue
      }
      ownerByDedupeKey.set(turn.dedupeKey, filePath)
      ownedDedupeKeys.push(turn.dedupeKey)
    }
    turns.push(stripClaudeSourceMetadata(turn))
  }
  return { turns, ownedDedupeKeys, hasDeferredClaims }
}

function combineProcessedFiles(
  files: string[],
  reusedByPath: Map<string, ClaudeUsagePersistedFile>,
  parsedByPath: Map<string, ClaudeUsagePersistedFile>
): {
  processedFiles: ClaudeUsagePersistedFile[]
  sessions: ClaudeUsageSession[]
  dailyAggregates: ClaudeUsageDailyAggregate[]
} {
  const processedFiles: ClaudeUsagePersistedFile[] = []
  const sessionsById = new Map<string, ClaudeUsageSession>()
  const dailyByKey = new Map<string, ClaudeUsageDailyAggregate>()
  for (const filePath of files) {
    const processed = reusedByPath.get(filePath) ?? parsedByPath.get(filePath)
    if (!processed) {
      continue
    }
    processedFiles.push(processed)
    mergeClaudeSessions(sessionsById, processed.sessions)
    mergeClaudeDailyAggregates(dailyByKey, processed.dailyAggregates)
  }
  return {
    processedFiles,
    sessions: finalizeClaudeSessions(sessionsById),
    dailyAggregates: finalizeClaudeDailyAggregates(dailyByKey)
  }
}
