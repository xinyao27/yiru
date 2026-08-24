import type { OpenCodeUsageRow } from './scanner-databases'
import type { OpenCodeUsageParsedEvent } from './types'

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

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
  const modelId = extractString(modelObject.modelID) ?? extractString(modelObject.id)
  const providerId = extractString(modelObject.providerID)
  return modelId ? (providerId ? `${providerId}/${modelId}` : modelId) : null
}

function extractProviderId(data: Record<string, unknown>, sessionModel: unknown): string | null {
  const directProvider = extractString(data.providerID) ?? extractString(data.providerId)
  if (directProvider) {
    return directProvider
  }
  const modelObject = parseJsonObject(data.model) ?? parseJsonObject(sessionModel)
  return extractString(modelObject?.providerID) ?? extractString(modelObject?.providerId)
}

function extractCwd(data: Record<string, unknown>, row: OpenCodeUsageRow): string | null {
  const pathData = parseJsonObject(data.path)
  return extractString(pathData?.cwd) ?? extractString(row.directory) ?? extractString(row.worktree)
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
  const tokens = parseJsonObject(data?.tokens)
  if (!data || !tokens) {
    return null
  }
  const cache = parseJsonObject(tokens.cache)
  const inputTokens = ensureNumber(tokens.input)
  const outputTokens = ensureNumber(tokens.output)
  const reasoningOutputTokens = ensureNumber(tokens.reasoning)
  const cachedInputTokens = ensureNumber(cache?.read)
  const explicitTotal = ensureNumber(tokens.total)
  const totalTokens =
    explicitTotal > 0
      ? explicitTotal
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
    // Why: only the OpenCode Go ledger is a comparable provider-cost contract.
    estimatedCostUsd:
      providerId?.toLowerCase() === 'opencode-go' && rawCost !== null && rawCost >= 0
        ? rawCost
        : null,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens
  }
}
