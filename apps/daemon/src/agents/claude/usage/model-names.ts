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

export function normalizeModelForPricing(model: string | null): string | null {
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
  if (lower === 'claude-sonnet-4-20250514') {
    return 'claude-sonnet-4-20250514'
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
