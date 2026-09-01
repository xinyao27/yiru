const REASONING_TIER_SUFFIXES = ['minimal', 'low', 'medium', 'high', 'xhigh', 'auto', 'none']

export function normalizeCodexModel(model: string | null): string | null {
  if (!model) {
    return null
  }
  const lower = stripParenthesizedReasoningTier(
    model
      .toLowerCase()
      .trim()
      .replace(/^openai(?:-codex)?[/:]/, '')
  )
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
    return 'gpt-5.3-codex-spark'
  }
  for (const modelKey of [
    'gpt-5-pro',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex',
    'gpt-5.1-codex-mini',
    'gpt-5.1',
    'gpt-5.2-codex',
    'gpt-5.2-pro',
    'gpt-5.2',
    'gpt-5.3-codex',
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
  // Why: unknown models must stay unpriced instead of inheriting the nearest
  // static family rate.
  return null
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

function isModelOrSnapshot(model: string, modelKey: string): boolean {
  if (model === modelKey) {
    return true
  }
  const escapedKey = modelKey.replace(/\./g, '\\.')
  return new RegExp(`^${escapedKey}-20\\d{2}-\\d{2}-\\d{2}$`).test(model)
}
