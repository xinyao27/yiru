import type { AiVaultSessionTokenUsage } from '@yiru/runtime-protocol/model/agent'

import type { CodexUsageSnapshot } from './scanner-types'
import { asRecord } from './scanner-values'

type NormalizedTokenUsage = Omit<AiVaultSessionTokenUsage, 'provider' | 'model' | 'timestamp'>

export function tokenTotal(value: unknown): number {
  const usage = asRecord(value)
  if (!usage) {
    return 0
  }
  const explicitTotal =
    numberValue(usage.total) || numberValue(usage.totalTokens) || numberValue(usage.total_tokens)
  if (explicitTotal > 0) {
    return explicitTotal
  }

  const fields: unknown[] = [
    usage.input,
    usage.inputTokens,
    usage.input_tokens,
    usage.output,
    usage.outputTokens,
    usage.output_tokens,
    usage.cacheRead,
    usage.cacheReadTokens,
    usage.cache_read_input_tokens,
    usage.cacheWrite,
    usage.cacheWriteTokens,
    usage.cache_creation_input_tokens,
    usage.cached,
    usage.cachedInputTokens,
    usage.cached_input_tokens
  ]
  const cache = asRecord(usage.cache)
  return (
    fields.reduce<number>((total, current) => total + numberValue(current), 0) +
    numberValue(cache?.read)
  )
}

export function normalizeTokenUsage(value: unknown): NormalizedTokenUsage | null {
  const usage = asRecord(value)
  if (!usage) {
    return null
  }
  const inputTokens = firstNumber(usage, [
    'input',
    'inputTokens',
    'input_tokens',
    'promptTokens',
    'prompt_tokens'
  ])
  const outputTokens = firstNumber(usage, [
    'output',
    'outputTokens',
    'output_tokens',
    'completionTokens',
    'completion_tokens'
  ])
  const cacheReadTokens = firstNumber(usage, [
    'cacheRead',
    'cacheReadTokens',
    'cache_read',
    'cache_read_tokens',
    'cacheReadInputTokens',
    'cache_read_input_tokens',
    'cached',
    'cachedInputTokens',
    'cached_input_tokens'
  ])
  const cacheWriteTokens = firstNumber(usage, [
    'cacheWrite',
    'cacheWriteTokens',
    'cache_write',
    'cache_write_tokens',
    'cacheCreationTokens',
    'cache_creation_input_tokens',
    'cache_creation_tokens',
    'cacheCreationInputTokens'
  ])
  const reasoningOutputTokens = firstNumber(usage, [
    'reasoning',
    'reasoningOutputTokens',
    'reasoning_output_tokens'
  ])
  const explicitTotal = firstNumber(usage, [
    'total',
    'totalTokens',
    'total_tokens',
    'tokenCount',
    'token_count',
    'tokens'
  ])
  // Why: Pi-compatible logs report reasoning as part of output. CodexBar keeps
  // it as a detail field but never adds it to the billable token total.
  const derivedTotal = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
  const totalTokens = Math.max(explicitTotal, derivedTotal)
  if (totalTokens <= 0) {
    return null
  }
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningOutputTokens,
    totalTokens
  }
}

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const value = numberValue(record[key])
    if (value > 0) {
      return value
    }
  }
  return 0
}

export function copilotModelMetricsTotal(value: unknown): number {
  const metrics = asRecord(value)
  if (!metrics) {
    return 0
  }
  let total = 0
  for (const metric of Object.values(metrics)) {
    const record = asRecord(metric)
    const usage = asRecord(record?.usage)
    if (!usage) {
      continue
    }
    total += tokenTotal(usage)
  }
  return total
}

export function claudeUsageTotal(value: unknown): number {
  const usage = asRecord(value)
  if (!usage) {
    return 0
  }
  return (
    numberValue(usage.input_tokens) +
    numberValue(usage.output_tokens) +
    numberValue(usage.cache_read_input_tokens) +
    numberValue(usage.cache_creation_input_tokens)
  )
}

export function normalizeCodexUsage(value: unknown): CodexUsageSnapshot | null {
  const usage = asRecord(value)
  if (!usage) {
    return null
  }
  const inputTokens = numberValue(usage.input_tokens)
  const cachedInputTokens = numberValue(usage.cached_input_tokens ?? usage.cache_read_input_tokens)
  const outputTokens = numberValue(usage.output_tokens)
  const reasoningOutputTokens = Math.min(numberValue(usage.reasoning_output_tokens), outputTokens)
  const totalTokens = inputTokens + cachedInputTokens + outputTokens

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens
  }
}

export function subtractCodexUsage(
  current: CodexUsageSnapshot,
  previous: CodexUsageSnapshot | null
): CodexUsageSnapshot {
  return {
    inputTokens: Math.max(current.inputTokens - (previous?.inputTokens ?? 0), 0),
    cachedInputTokens: Math.max(current.cachedInputTokens - (previous?.cachedInputTokens ?? 0), 0),
    outputTokens: Math.max(current.outputTokens - (previous?.outputTokens ?? 0), 0),
    reasoningOutputTokens: Math.max(
      current.reasoningOutputTokens - (previous?.reasoningOutputTokens ?? 0),
      0
    ),
    totalTokens: Math.max(current.totalTokens - (previous?.totalTokens ?? 0), 0)
  }
}

export function numberValue(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0
  }
  return 0
}

export function addCodexUsage(
  base: CodexUsageSnapshot,
  increment: CodexUsageSnapshot
): CodexUsageSnapshot {
  return {
    inputTokens: base.inputTokens + increment.inputTokens,
    cachedInputTokens: base.cachedInputTokens + increment.cachedInputTokens,
    outputTokens: base.outputTokens + increment.outputTokens,
    reasoningOutputTokens: base.reasoningOutputTokens + increment.reasoningOutputTokens,
    totalTokens: base.totalTokens + increment.totalTokens
  }
}
