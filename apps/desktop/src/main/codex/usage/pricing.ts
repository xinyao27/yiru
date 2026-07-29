type CodexTokenPricing = {
  input: number
  cachedInput: number
  output: number
  cacheWriteMultiplier?: number
}

type CodexModelPricing = CodexTokenPricing & {
  longContext?: {
    thresholdTokens: number
  } & CodexTokenPricing
}

const LONG_CONTEXT_THRESHOLD_TOKENS = 272_000

const MODEL_PRICING: Record<string, CodexModelPricing> = {
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.1': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.1-codex': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.1-codex-max': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.2': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.2-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.3': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.3-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
  'gpt-5.4-pro': {
    input: 30,
    cachedInput: 30,
    output: 180,
    longContext: {
      thresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 60,
      cachedInput: 60,
      output: 270
    }
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
    input: 2.5,
    cachedInput: 0.25,
    output: 15,
    cacheWriteMultiplier: 1.25,
    longContext: {
      thresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 5,
      cachedInput: 0.5,
      output: 22.5,
      cacheWriteMultiplier: 1.25
    }
  },
  'gpt-5.6-luna': {
    input: 1,
    cachedInput: 0.1,
    output: 6,
    cacheWriteMultiplier: 1.25,
    longContext: {
      thresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
      input: 2,
      cachedInput: 0.2,
      output: 9,
      cacheWriteMultiplier: 1.25
    }
  }
}

const REASONING_TIER_SUFFIXES = ['minimal', 'low', 'medium', 'high', 'xhigh', 'auto', 'none']

export function priceCodexUsage(
  model: string | null,
  inputTokens: number,
  cachedInputTokens: number,
  cacheWriteTokens: number,
  outputTokens: number
): number | null {
  const normalized = normalizeModelForPricing(model)
  if (!normalized) {
    return null
  }
  const basePricing = MODEL_PRICING[normalized]
  const pricing =
    basePricing.longContext && inputTokens > basePricing.longContext.thresholdTokens
      ? basePricing.longContext
      : basePricing
  const clampedCached = Math.min(cachedInputTokens, inputTokens)
  const clampedCacheWrite = Math.min(cacheWriteTokens, inputTokens)
  if (
    (clampedCacheWrite > 0 && pricing.cacheWriteMultiplier === undefined) ||
    clampedCached + clampedCacheWrite > inputTokens
  ) {
    return null
  }
  const nonCachedInputTokens = Math.max(inputTokens - clampedCached - clampedCacheWrite, 0)
  return (
    (nonCachedInputTokens * pricing.input +
      clampedCached * pricing.cachedInput +
      clampedCacheWrite * pricing.input * (pricing.cacheWriteMultiplier ?? 0) +
      outputTokens * pricing.output) /
    1_000_000
  )
}

export function priceCodexAggregateUsage(
  model: string | null,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): number | null {
  const normalized = normalizeModelForPricing(model)
  if (!normalized) {
    return null
  }
  const pricing = MODEL_PRICING[normalized]
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

function stripParenthesizedReasoningTier(model: string): string | null {
  const match = model.match(/^(.*)\(([^()]*)\)$/)
  if (!match) {
    return model
  }
  const tier = match[2].trim().toLowerCase()
  return REASONING_TIER_SUFFIXES.includes(tier) ? match[1] : null
}

function stripDashReasoningTiers(model: string): string {
  let current = model
  for (let index = 0; index < 4; index++) {
    const suffix = REASONING_TIER_SUFFIXES.find((tier) => current.endsWith(`-${tier}`))
    if (!suffix) {
      return current
    }
    current = current.slice(0, -suffix.length - 1)
  }
  return current
}

function normalizeModelForPricing(model: string | null): string | null {
  if (!model) {
    return null
  }
  const lower = stripParenthesizedReasoningTier(model.toLowerCase().trim())
  if (!lower) {
    return null
  }
  const normalized = stripDashReasoningTiers(lower)
  if (normalized === 'gpt-5' || normalized === 'gpt-5-codex') {
    return 'gpt-5'
  }
  if (normalized === 'gpt-5.6' || isModelOrSnapshot(normalized, 'gpt-5.6-sol')) {
    return 'gpt-5.6-sol'
  }
  if (normalized === 'gpt-5.3-codex-spark' || normalized.startsWith('gpt-5.3-codex-spark-')) {
    return null
  }
  for (const modelKey of [
    'gpt-5.1-codex-max',
    'gpt-5.1-codex',
    'gpt-5.1',
    'gpt-5.2-codex',
    'gpt-5.2',
    'gpt-5.3-codex',
    'gpt-5.3',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.4-pro',
    'gpt-5.4',
    'gpt-5.5-pro',
    'gpt-5.5',
    'gpt-5.6-terra',
    'gpt-5.6-luna'
  ]) {
    if (isModelOrSnapshot(normalized, modelKey)) {
      return modelKey
    }
  }
  // Why: GPT-5.3-Codex-Spark is still a research preview without final token
  // rates, so it deliberately remains unpriced instead of inheriting 5.3.
  return null
}

function isModelOrSnapshot(model: string, modelKey: string): boolean {
  if (model === modelKey) {
    return true
  }
  const escapedKey = modelKey.replace(/\./g, '\\.')
  return new RegExp(`^${escapedKey}-20\\d{2}-\\d{2}-\\d{2}$`).test(model)
}
