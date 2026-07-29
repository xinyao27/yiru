type ClaudeModelPricing = {
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
}

type ClaudeUsagePriceInput = {
  model: string | null
  timestamp?: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheWrite5mTokens?: number
  cacheWrite1hTokens?: number
}

export type ClaudeUsagePrice = {
  estimatedCostUsd: number | null
  unpricedTokens: number
}

const LONG_CONTEXT_THRESHOLD_TOKENS = 200_000
const ALL_CONTEXT_STANDARD_PRICING = new Set([
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
    cacheWrite1h: 6
  },
  'claude-sonnet-4': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6
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

const MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4.8': 'claude-opus-4-8',
  'claude-opus-4.6': 'claude-opus-4-6',
  'claude-sonnet-4.6': 'claude-sonnet-4-6',
  'claude-opus-4.8-thinking': 'claude-opus-4-8',
  'claude-opus-4.6-thinking': 'claude-opus-4-6',
  'claude-sonnet-4.6-thinking': 'claude-sonnet-4-6',
  'claude-opus-4-8-thinking': 'claude-opus-4-8',
  'claude-opus-4-6-thinking': 'claude-opus-4-6',
  'claude-sonnet-4-6-thinking': 'claude-sonnet-4-6'
}

export function priceClaudeUsage(input: ClaudeUsagePriceInput): ClaudeUsagePrice {
  const totalTokens =
    input.inputTokens + input.outputTokens + input.cacheReadTokens + input.cacheWriteTokens
  const normalized = normalizeModelForPricing(input.model)
  if (!normalized) {
    return { estimatedCostUsd: null, unpricedTokens: totalTokens }
  }
  const pricing = resolvePricing(normalized, input.timestamp)
  if (!pricing) {
    return { estimatedCostUsd: null, unpricedTokens: totalTokens }
  }
  const totalRequestInput = input.inputTokens + input.cacheReadTokens + input.cacheWriteTokens
  if (
    totalRequestInput > LONG_CONTEXT_THRESHOLD_TOKENS &&
    !ALL_CONTEXT_STANDARD_PRICING.has(normalized)
  ) {
    // Why: older Claude models selected a whole-request long-context SKU. The
    // current official table no longer supplies every historical tier, so a
    // request over 200K must stay unpriced instead of inheriting a base rate.
    return { estimatedCostUsd: null, unpricedTokens: totalTokens }
  }

  const cacheWrite5mTokens = Math.min(
    Math.max(input.cacheWrite5mTokens ?? 0, 0),
    input.cacheWriteTokens
  )
  const cacheWrite1hTokens = Math.min(
    Math.max(input.cacheWrite1hTokens ?? 0, 0),
    Math.max(input.cacheWriteTokens - cacheWrite5mTokens, 0)
  )
  const knownCacheWriteTokens = cacheWrite5mTokens + cacheWrite1hTokens
  const unpricedTokens = Math.max(input.cacheWriteTokens - knownCacheWriteTokens, 0)
  const pricedTokens = totalTokens - unpricedTokens
  if (pricedTokens <= 0) {
    return { estimatedCostUsd: null, unpricedTokens }
  }

  return {
    estimatedCostUsd:
      (input.inputTokens * pricing.input +
        input.outputTokens * pricing.output +
        input.cacheReadTokens * pricing.cacheRead +
        cacheWrite5mTokens * pricing.cacheWrite5m +
        cacheWrite1hTokens * pricing.cacheWrite1h) /
      1_000_000,
    unpricedTokens
  }
}

function resolvePricing(model: string, timestamp: string | undefined): ClaudeModelPricing | null {
  if (model !== 'claude-sonnet-5') {
    return MODEL_PRICING[model] ?? null
  }
  const day = timestamp?.slice(0, 10)
  if (!day || !/^20\d{2}-\d{2}-\d{2}$/.test(day)) {
    // Why: Sonnet 5 has a date-bounded introductory rate. An aggregate without
    // a request date cannot choose the authoritative SKU.
    return null
  }
  return day < SONNET_5_STANDARD_PRICING_START_DAY
    ? SONNET_5_INTRODUCTORY_PRICING
    : SONNET_5_STANDARD_PRICING
}

function hasClaudeModelVersion(model: string, family: string, version: string): boolean {
  const normalized = model.replace(/\./g, '-')
  return new RegExp(
    `${family}-${version}(?:$|-thinking$|-20\\d{6}(?:-thinking)?$|@20\\d{6}$)`
  ).test(normalized)
}

function isLegacyBaseModel(model: string, family: 'opus' | 'sonnet'): boolean {
  const normalized = model.replace(/\./g, '-')
  return new RegExp(`${family}-4(?:$|-thinking$|-20\\d{6}(?:-thinking)?$|@20\\d{6}$)`).test(
    normalized
  )
}

function normalizeModelForPricing(model: string | null): string | null {
  if (!model) {
    return null
  }
  const lower = model
    .toLowerCase()
    .trim()
    .replace(/^anthropic[/:]/, '')
  const alias = MODEL_ALIASES[lower]
  if (alias) {
    return alias
  }
  for (const family of ['fable', 'mythos']) {
    if (hasClaudeModelVersion(lower, family, '5')) {
      return `claude-${family}-5`
    }
  }
  for (const version of ['4-8', '4-7', '4-6', '4-5', '4-1']) {
    if (hasClaudeModelVersion(lower, 'opus', version)) {
      return `claude-opus-${version}`
    }
  }
  if (isLegacyBaseModel(lower, 'opus')) {
    return 'claude-opus-4'
  }
  for (const version of ['5', '4-6', '4-5']) {
    if (hasClaudeModelVersion(lower, 'sonnet', version)) {
      return `claude-sonnet-${version}`
    }
  }
  if (isLegacyBaseModel(lower, 'sonnet')) {
    return 'claude-sonnet-4'
  }
  if (lower.includes('sonnet-3-7') || lower.includes('sonnet-3.7')) {
    return 'claude-sonnet-3-7'
  }
  if (
    lower.includes('sonnet-3-5') ||
    lower.includes('sonnet-3.5') ||
    lower.includes('3-5-sonnet') ||
    lower.includes('3.5-sonnet')
  ) {
    return 'claude-sonnet-3-5'
  }
  if (lower.includes('haiku-4-5')) {
    return 'claude-haiku-4-5'
  }
  if (
    lower.includes('haiku-3-5') ||
    lower.includes('haiku-3.5') ||
    lower.includes('3-5-haiku') ||
    lower.includes('3.5-haiku')
  ) {
    return 'claude-haiku-3-5'
  }
  return null
}
