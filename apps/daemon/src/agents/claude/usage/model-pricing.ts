import { findModelsDevPricing, type ModelsDevPricing } from '~main/stats/models-dev-pricing'

import { normalizeModelForPricing } from './model-names'

export type ClaudeModelPricing = {
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
  longContext?: {
    thresholdTokens: number
    input: number
    output: number
    cacheRead: number
    cacheWrite5m: number
    cacheWrite1h: number
  }
}

export type ClaudePricingResolution = {
  pricing: ClaudeModelPricing
  normalizedModel: string
  isModelsDev: boolean
}

export const CLAUDE_LONG_CONTEXT_THRESHOLD_TOKENS = 200_000
export const CLAUDE_FULL_CONTEXT_STANDARD_CUTOFF_MS = 1_773_360_000_000
export const CLAUDE_ALL_CONTEXT_STANDARD_PRICING = new Set([
  'claude-fable-5',
  'claude-mythos-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5',
  'claude-sonnet-4-6'
])

const SONNET_5_STANDARD_PRICING_START_DAY = '2026-09-01'
const SONNET_5_INTRODUCTORY_PRICING: ClaudeModelPricing = {
  input: 2,
  output: 10,
  cacheRead: 0.2,
  cacheWrite5m: 2.5,
  cacheWrite1h: 4
}
const SONNET_5_STANDARD_PRICING: ClaudeModelPricing = {
  input: 3,
  output: 15,
  cacheRead: 0.3,
  cacheWrite5m: 3.75,
  cacheWrite1h: 6
}

const HISTORICAL_LONG_CONTEXT_PRICING: Record<string, ClaudeModelPricing> = {
  'claude-opus-4-6': {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    longContext: {
      thresholdTokens: CLAUDE_LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 10,
      output: 37.5,
      cacheRead: 1,
      cacheWrite5m: 12.5,
      cacheWrite1h: 20
    }
  },
  'claude-sonnet-4-6': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
    longContext: {
      thresholdTokens: CLAUDE_LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 6,
      output: 22.5,
      cacheRead: 0.6,
      cacheWrite5m: 7.5,
      cacheWrite1h: 12
    }
  }
}

const MODEL_PRICING: Record<string, ClaudeModelPricing> = {
  'claude-fable-5': {
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite5m: 12.5,
    cacheWrite1h: 20
  },
  'claude-mythos-5': {
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite5m: 12.5,
    cacheWrite1h: 20
  },
  'claude-opus-4-8': {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10
  },
  'claude-opus-4-7': {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10
  },
  'claude-opus-4-6': {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10
  },
  'claude-opus-4-5': {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10
  },
  'claude-opus-4-1': {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite5m: 18.75,
    cacheWrite1h: 30
  },
  'claude-opus-4': {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite5m: 18.75,
    cacheWrite1h: 30
  },
  'claude-sonnet-4-6': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6
  },
  'claude-sonnet-4-5': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
    longContext: {
      thresholdTokens: CLAUDE_LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 6,
      output: 22.5,
      cacheRead: 0.6,
      cacheWrite5m: 7.5,
      cacheWrite1h: 12
    }
  },
  'claude-sonnet-4': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6
  },
  'claude-sonnet-4-20250514': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
    longContext: {
      thresholdTokens: CLAUDE_LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 6,
      output: 22.5,
      cacheRead: 0.6,
      cacheWrite5m: 7.5,
      cacheWrite1h: 12
    }
  },
  'claude-sonnet-3-7': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6
  },
  'claude-sonnet-3-5': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6
  },
  'claude-haiku-4-5': {
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite5m: 1.25,
    cacheWrite1h: 2
  },
  'claude-haiku-3-5': {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite5m: 1,
    cacheWrite1h: 1.6
  }
}

export function resolveClaudePricing(
  model: string | null,
  timestamp: string | undefined
): ClaudePricingResolution | null {
  const normalized = normalizeModelForPricing(model)
  if (!normalized) {
    const modelsDevPricing = findModelsDevPricing('anthropic', model)
    return modelsDevPricing
      ? {
          pricing: fromModelsDevPricing(modelsDevPricing),
          normalizedModel: model?.trim().toLowerCase() ?? 'unknown',
          isModelsDev: true
        }
      : null
  }
  if (normalized === 'claude-sonnet-5') {
    const day = timestamp?.slice(0, 10)
    if (!day || !/^20\d{2}-\d{2}-\d{2}$/.test(day)) {
      // Why: Sonnet 5 has a date-bounded introductory rate. An aggregate without
      // a request date cannot choose the authoritative SKU.
      return null
    }
    return {
      pricing:
        day < SONNET_5_STANDARD_PRICING_START_DAY
          ? SONNET_5_INTRODUCTORY_PRICING
          : SONNET_5_STANDARD_PRICING,
      normalizedModel: normalized,
      isModelsDev: false
    }
  }
  const historicalPricing = historicalClaudePricing(normalized, timestamp)
  if (historicalPricing) {
    return {
      pricing: historicalPricing,
      normalizedModel: normalized,
      isModelsDev: false
    }
  }
  const modelsDevPricing = findModelsDevPricing('anthropic', model)
  if (modelsDevPricing) {
    return {
      pricing: fromModelsDevPricing(modelsDevPricing),
      normalizedModel: normalized,
      isModelsDev: true
    }
  }
  const pricing = MODEL_PRICING[normalized]
  return pricing ? { pricing, normalizedModel: normalized, isModelsDev: false } : null
}

function historicalClaudePricing(
  model: string,
  timestamp: string | undefined
): ClaudeModelPricing | null {
  const timestampMs = timestamp ? new Date(timestamp).getTime() : Number.NaN
  if (!Number.isFinite(timestampMs) || timestampMs >= CLAUDE_FULL_CONTEXT_STANDARD_CUTOFF_MS) {
    return null
  }
  return HISTORICAL_LONG_CONTEXT_PRICING[model] ?? null
}

function fromModelsDevPricing(pricing: ModelsDevPricing): ClaudeModelPricing {
  const input = pricing.input
  const output = pricing.output
  const cacheRead = pricing.cacheRead ?? input
  const cacheWrite5m = pricing.cacheWrite ?? input
  return {
    input,
    output,
    cacheRead,
    cacheWrite5m,
    cacheWrite1h: input * 2,
    ...(pricing.thresholdTokens
      ? {
          longContext: {
            thresholdTokens: pricing.thresholdTokens,
            input: pricing.inputAboveThreshold ?? input,
            output: pricing.outputAboveThreshold ?? output,
            cacheRead: pricing.cacheReadAboveThreshold ?? cacheRead,
            cacheWrite5m: pricing.cacheWriteAboveThreshold ?? cacheWrite5m,
            cacheWrite1h: (pricing.inputAboveThreshold ?? input) * 2
          }
        }
      : {})
  }
}
