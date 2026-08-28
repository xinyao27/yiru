import { findModelsDevPricing, type ModelsDevPricing } from '~main/stats/models-dev-pricing'

import { normalizeCodexModel } from './model-names'
import { codexPriorityMultiplier } from './priority-pricing'

type CodexTokenPricing = {
  input: number
  cachedInput: number
  output: number
  cacheWriteRate?: number
  cacheWriteMultiplier?: number
}

type CodexModelPricing = CodexTokenPricing & {
  longContext?: {
    thresholdTokens: number
  } & CodexTokenPricing
}

type CodexUsagePricingOptions = {
  isPriority?: boolean
  priorityModel?: string | null
}

const LONG_CONTEXT_THRESHOLD_TOKENS = 272_000

const MODEL_PRICING: Record<string, CodexModelPricing> = {
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-5-pro': { input: 15, cachedInput: 15, output: 120 },
  'gpt-5.1': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.1-codex': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.1-codex-max': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.1-codex-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5.2': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.2-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.2-pro': { input: 21, cachedInput: 21, output: 168 },
  'gpt-5.3-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.3-codex-spark': { input: 0, cachedInput: 0, output: 0 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
  'gpt-5.4-pro': {
    input: 30,
    cachedInput: 30,
    output: 180
  },
  'gpt-5.4': {
    input: 2.5,
    cachedInput: 0.25,
    output: 15,
    longContext: {
      thresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 5,
      cachedInput: 0.5,
      output: 22.5
    }
  },
  'gpt-5.5-pro': { input: 30, cachedInput: 30, output: 180 },
  'gpt-5.5': {
    input: 5,
    cachedInput: 0.5,
    output: 30,
    longContext: {
      thresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 10,
      cachedInput: 1,
      output: 45
    }
  },
  'gpt-5.6-sol': {
    input: 5,
    cachedInput: 0.5,
    output: 30,
    cacheWriteMultiplier: 1.25,
    longContext: {
      thresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 10,
      cachedInput: 1,
      output: 45,
      cacheWriteMultiplier: 1.25
    }
  },
  'gpt-5.6-terra': {
    input: 2,
    cachedInput: 0.2,
    output: 12,
    cacheWriteMultiplier: 1.25,
    longContext: {
      thresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 4,
      cachedInput: 0.4,
      output: 18,
      cacheWriteMultiplier: 1.25
    }
  },
  'gpt-5.6-luna': {
    input: 0.2,
    cachedInput: 0.3,
    output: 1.2,
    cacheWriteRate: 3.75,
    longContext: {
      thresholdTokens: 200_000,
      input: 6,
      cachedInput: 0.6,
      output: 22.5,
      cacheWriteRate: 7.5
    }
  }
}

export function priceCodexUsage(
  model: string | null,
  inputTokens: number,
  cachedInputTokens: number,
  cacheWriteTokens: number,
  outputTokens: number,
  options: CodexUsagePricingOptions = {}
): number | null {
  const resolution = resolveCodexPricing(model)
  if (!resolution) {
    return null
  }
  const basePricing = resolution.pricing
  const pricing =
    basePricing.longContext && inputTokens > basePricing.longContext.thresholdTokens
      ? basePricing.longContext
      : basePricing
  const totalInputTokens = Math.max(inputTokens, 0)
  const clampedCached = Math.min(Math.max(cachedInputTokens, 0), totalInputTokens)
  const clampedCacheWrite = Math.min(
    Math.max(cacheWriteTokens, 0),
    Math.max(totalInputTokens - clampedCached, 0)
  )
  const nonCachedInputTokens = totalInputTokens - clampedCached - clampedCacheWrite
  // Why: CodexBar treats a cache-write field without a dedicated SKU as ordinary input.
  const cacheWriteRate =
    pricing.cacheWriteRate ?? pricing.input * (pricing.cacheWriteMultiplier ?? 1)
  const standardCost =
    (nonCachedInputTokens * pricing.input +
      clampedCached * pricing.cachedInput +
      clampedCacheWrite * cacheWriteRate +
      Math.max(outputTokens, 0) * pricing.output) /
    1_000_000
  if (!options.isPriority) {
    return standardCost
  }
  const priorityModel = options.priorityModel ?? model
  const multiplier = codexPriorityMultiplier(priorityModel)
  return multiplier !== null && totalInputTokens <= LONG_CONTEXT_THRESHOLD_TOKENS
    ? standardCost * multiplier
    : standardCost
}

export function priceCodexAggregateUsage(
  model: string | null,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): number | null {
  const resolution = resolveCodexPricing(model)
  if (!resolution) {
    return null
  }
  const pricing = resolution.pricing
  if (
    pricing.cacheWriteMultiplier !== undefined ||
    (pricing.longContext && inputTokens > pricing.longContext.thresholdTokens)
  ) {
    // Why: an aggregate above 272K may be one premium request or many standard
    // requests. Only the per-event scanner can select the full-request SKU.
    return null
  }
  return priceCodexUsage(model, inputTokens, cachedInputTokens, 0, outputTokens)
}

function resolveCodexPricing(
  model: string | null
): { pricing: CodexModelPricing; normalizedModel: string | null } | null {
  const normalized = normalizeCodexModel(model)
  const modelsDevPricing = findModelsDevPricing('openai', model)
  if (modelsDevPricing) {
    return {
      pricing: fromModelsDevPricing(
        modelsDevPricing,
        normalized ? MODEL_PRICING[normalized] : null
      ),
      normalizedModel: normalized
    }
  }
  if (!normalized) {
    return null
  }
  const pricing = MODEL_PRICING[normalized]
  return pricing ? { pricing, normalizedModel: normalized } : null
}

function fromModelsDevPricing(
  pricing: ModelsDevPricing,
  bundled: CodexModelPricing | null
): CodexModelPricing {
  const input = pricing.input
  const cachedInput = pricing.cacheRead ?? bundled?.cachedInput ?? input
  const bundledCacheWriteRate =
    bundled?.cacheWriteRate ??
    (bundled ? bundled.input * (bundled.cacheWriteMultiplier ?? 1) : undefined)
  const cacheWriteRate = pricing.cacheWrite ?? bundledCacheWriteRate
  const bundledLongContext = pricing.thresholdTokens === null ? bundled?.longContext : null
  const longCachedInput =
    pricing.cacheReadAboveThreshold ??
    (pricing.thresholdTokens !== null
      ? (pricing.cacheRead ?? pricing.inputAboveThreshold ?? input)
      : (bundledLongContext?.cachedInput ?? cachedInput))
  const longCacheWriteRate =
    pricing.cacheWriteAboveThreshold ??
    (pricing.thresholdTokens !== null
      ? (pricing.cacheWrite ?? pricing.inputAboveThreshold ?? input)
      : (bundledLongContext?.cacheWriteRate ?? cacheWriteRate))
  return {
    input,
    cachedInput,
    output: pricing.output,
    cacheWriteRate,
    ...(pricing.thresholdTokens || bundled?.longContext
      ? {
          longContext: {
            thresholdTokens: bundled?.longContext?.thresholdTokens ?? pricing.thresholdTokens ?? 0,
            input: pricing.inputAboveThreshold ?? bundledLongContext?.input ?? input,
            cachedInput: longCachedInput,
            output: pricing.outputAboveThreshold ?? bundledLongContext?.output ?? pricing.output,
            cacheWriteRate: longCacheWriteRate
          }
        }
      : {})
  }
}
