import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { createInterface } from 'node:readline'

import { priceClaudeUsage } from './pricing'
import type { ClaudeUsageParsedTurn, ClaudeUsageProcessedFile } from './types'

type ClaudeUsageSourceRecord = {
  type?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  gitBranch?: string
  requestId?: string
  uuid?: string
  message?: {
    id?: string
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
      cache_creation?: {
        ephemeral_1h_input_tokens?: number
      }
    }
  }
}

export type ClaudeUsageParsedSourceTurn = Omit<
  ClaudeUsageParsedTurn,
  'estimatedCostUsd' | 'unpricedTokens'
> & {
  dedupeKey: string | null
  cacheWrite1hTokens: number
  isVertexAI: boolean
}

const VERTEX_PROVIDER_KEYS = new Set([
  'provider',
  'platform',
  'backend',
  'api_provider',
  'apiprovider',
  'api_type',
  'apitype',
  'source',
  'vendor',
  'client'
])

export async function readClaudeUsageScanFile(filePath: string): Promise<{
  processedFile: ClaudeUsageProcessedFile
  turns: ClaudeUsageParsedSourceTurn[]
}> {
  const fileStat = await stat(filePath)
  let lineCount = 0
  const turns: ClaudeUsageParsedSourceTurn[] = []
  const fallbackSessionId = basename(filePath, '.jsonl')
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  })
  for await (const line of lines) {
    lineCount++
    const parsed = parseSourceRecord(line, fallbackSessionId)
    if (parsed) {
      turns.push(parsed)
    }
  }
  return {
    processedFile: {
      path: filePath,
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      lineCount
    },
    turns: dedupeTurns(turns)
  }
}

export function stripClaudeSourceMetadata(
  turn: ClaudeUsageParsedSourceTurn
): ClaudeUsageParsedTurn {
  const price = turn.isVertexAI
    ? {
        estimatedCostUsd: null,
        unpricedTokens:
          turn.inputTokens + turn.outputTokens + turn.cacheReadTokens + turn.cacheWriteTokens
      }
    : priceClaudeUsage({
        model: turn.model,
        timestamp: turn.timestamp,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        cacheReadTokens: turn.cacheReadTokens,
        cacheWriteTokens: turn.cacheWriteTokens,
        cacheWrite1hTokens: turn.cacheWrite1hTokens
      })
  return {
    sessionId: turn.sessionId,
    timestamp: turn.timestamp,
    model: turn.model,
    cwd: turn.cwd,
    gitBranch: turn.gitBranch,
    inputTokens: turn.inputTokens,
    outputTokens: turn.outputTokens,
    cacheReadTokens: turn.cacheReadTokens,
    cacheWriteTokens: turn.cacheWriteTokens,
    ...price
  }
}

function parseSourceRecord(
  line: string,
  fallbackSessionId: string
): ClaudeUsageParsedSourceTurn | null {
  let parsed: ClaudeUsageSourceRecord
  try {
    parsed = JSON.parse(line) as ClaudeUsageSourceRecord
  } catch {
    return null
  }
  const sessionId = parsed.sessionId ?? fallbackSessionId
  if (parsed.type !== 'assistant' || !sessionId || !parsed.timestamp) {
    return null
  }
  const usage = parsed.message?.usage
  const inputTokens = nonNegativeTokenCount(usage?.input_tokens)
  const outputTokens = nonNegativeTokenCount(usage?.output_tokens)
  const cacheReadTokens = nonNegativeTokenCount(usage?.cache_read_input_tokens)
  const cacheWriteTokens = nonNegativeTokenCount(usage?.cache_creation_input_tokens)
  if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens <= 0) {
    return null
  }
  return {
    sessionId,
    timestamp: parsed.timestamp,
    model: parsed.message?.model ?? null,
    cwd: parsed.cwd ?? null,
    gitBranch: parsed.gitBranch ?? null,
    dedupeKey: buildDedupeKey(parsed),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheWrite1hTokens: Math.min(
      nonNegativeTokenCount(usage?.cache_creation?.ephemeral_1h_input_tokens),
      cacheWriteTokens
    ),
    isVertexAI: isVertexAIUsageRecord(parsed)
  }
}

function dedupeTurns(turns: ClaudeUsageParsedSourceTurn[]): ClaudeUsageParsedSourceTurn[] {
  const indexByKey = new Map<string, number>()
  const deduped: ClaudeUsageParsedSourceTurn[] = []
  for (const turn of turns) {
    const existingIndex = turn.dedupeKey ? indexByKey.get(turn.dedupeKey) : undefined
    if (existingIndex !== undefined) {
      const existing = deduped[existingIndex]
      existing.inputTokens = Math.max(existing.inputTokens, turn.inputTokens)
      existing.outputTokens = Math.max(existing.outputTokens, turn.outputTokens)
      existing.cacheReadTokens = Math.max(existing.cacheReadTokens, turn.cacheReadTokens)
      existing.cacheWriteTokens = Math.max(existing.cacheWriteTokens, turn.cacheWriteTokens)
      existing.cacheWrite1hTokens = Math.max(existing.cacheWrite1hTokens, turn.cacheWrite1hTokens)
      existing.isVertexAI ||= turn.isVertexAI
      continue
    }
    deduped.push({ ...turn })
    if (turn.dedupeKey) {
      indexByKey.set(turn.dedupeKey, deduped.length - 1)
    }
  }
  return deduped
}

function nonNegativeTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0
}

function isVertexAIUsageRecord(parsed: ClaudeUsageSourceRecord): boolean {
  return (
    parsed.message?.id?.includes('_vrtx_') === true ||
    parsed.requestId?.includes('_vrtx_') === true ||
    (parsed.message?.model !== undefined &&
      parsed.message.model.startsWith('claude-') &&
      parsed.message.model.includes('@')) ||
    containsVertexAIMetadata(parsed as unknown as Record<string, unknown>)
  )
}

function containsVertexAIMetadata(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsVertexAIMetadata)
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  return Object.entries(value).some(([key, nestedValue]) => {
    const lowerKey = key.toLowerCase()
    return (
      lowerKey.includes('vertex') ||
      lowerKey.includes('gcp') ||
      (VERTEX_PROVIDER_KEYS.has(lowerKey) &&
        typeof nestedValue === 'string' &&
        nestedValue.toLowerCase().includes('vertex')) ||
      containsVertexAIMetadata(nestedValue)
    )
  })
}

function buildDedupeKey(parsed: ClaudeUsageSourceRecord): string | null {
  const messageId = parsed.message?.id?.trim()
  const requestId = parsed.requestId?.trim()
  if (messageId && requestId) {
    return `${messageId}:${requestId}`
  }
  if (messageId) {
    return `msg:${messageId}`
  }
  const uuid = parsed.uuid?.trim()
  return uuid ? `uuid:${uuid}` : null
}
