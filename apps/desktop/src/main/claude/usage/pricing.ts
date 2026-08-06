import {
  CLAUDE_ALL_CONTEXT_STANDARD_PRICING,
  CLAUDE_LONG_CONTEXT_THRESHOLD_TOKENS,
  resolveClaudePricing
} from './model-pricing'

type ClaudeUsagePriceInput = {
  model: string | null
  timestamp?: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheWrite1hTokens?: number
}

export type ClaudeUsagePrice = {
  estimatedCostUsd: number | null
  unpricedTokens: number
}

export function priceClaudeUsage(input: ClaudeUsagePriceInput): ClaudeUsagePrice {
  const inputTokens = Math.max(input.inputTokens, 0)
  const outputTokens = Math.max(input.outputTokens, 0)
  const cacheReadTokens = Math.max(input.cacheReadTokens, 0)
  const cacheWriteTokens = Math.max(input.cacheWriteTokens, 0)
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
  const resolution = resolveClaudePricing(input.model, input.timestamp)
  if (!resolution) {
    return { estimatedCostUsd: null, unpricedTokens: totalTokens }
  }
  const totalRequestInput = inputTokens + cacheReadTokens + cacheWriteTokens
  const pricing =
    resolution.pricing.longContext &&
    totalRequestInput > resolution.pricing.longContext.thresholdTokens
      ? resolution.pricing.longContext
      : resolution.pricing
  if (
    totalRequestInput > CLAUDE_LONG_CONTEXT_THRESHOLD_TOKENS &&
    !resolution.isModelsDev &&
    !resolution.pricing.longContext &&
    !CLAUDE_ALL_CONTEXT_STANDARD_PRICING.has(resolution.normalizedModel)
  ) {
    // Why: older Claude models selected a whole-request long-context SKU. The
    // current official table no longer supplies every historical tier, so a
    // request over 200K must stay unpriced instead of inheriting a base rate.
    return { estimatedCostUsd: null, unpricedTokens: totalTokens }
  }

  const cacheWrite1hTokens = Math.min(Math.max(input.cacheWrite1hTokens ?? 0, 0), cacheWriteTokens)
  // Why: Claude Code reports total cache creation plus the optional one-hour
  // subset. CodexBar bills the remainder at the five-minute tariff.
  const cacheWrite5mTokens = cacheWriteTokens - cacheWrite1hTokens

  return {
    estimatedCostUsd:
      (inputTokens * pricing.input +
        outputTokens * pricing.output +
        cacheReadTokens * pricing.cacheRead +
        cacheWrite5mTokens * pricing.cacheWrite5m +
        cacheWrite1hTokens * pricing.cacheWrite1h) /
      1_000_000,
    unpricedTokens: 0
  }
}
