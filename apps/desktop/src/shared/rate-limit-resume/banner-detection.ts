// Pure recognition of a provider "you are out of quota" banner in agent output.
// Provider-agnostic by design: every agent prints its own wording, so the table
// below carries the per-agent phrasings we know and a conservative generic
// fallback covers the rest.

import type { AgentType } from '@yiru/workbench-model/agent'

/** Lines kept around a matched banner and handed to reset resolution. */
export const RATE_LIMIT_BANNER_CONTEXT_LINES = 8

/** Why: a TUI redraws the same banner on every frame. One hit per window. */
export const RATE_LIMIT_BANNER_COOLDOWN_MS = 60_000

// Phrasings that mean "the quota is spent" on their own.
const DEFINITIVE_LIMIT_PATTERNS: RegExp[] = [
  /\b(usage|quota|rate|token)\s+limit\s+(reached|exceeded|hit)\b/i,
  /\byou'?(?:ve|ve| have)\s+(?:hit|reached|used)\s+(?:up\s+)?your\b[^.\n]{0,60}\blimit\b/i,
  /\blimit\s+reached\b/i,
  /\bquota\s+(?:exceeded|exhausted)\b/i,
  /\bout\s+of\s+(?:weekly|daily|monthly)?\s*(?:usage|quota|credits)\b/i,
  /\binsufficient\s+(?:quota|credits|balance)\b/i
]

// Phrasings that are only a limit when paired with a recovery hint.
const AMBIGUOUS_LIMIT_PATTERNS: RegExp[] = [
  /\brate[- ]limit(?:ed|ing)?\b/i,
  /\btoo\s+many\s+requests\b/i,
  /\b429\b/,
  /\bupgrade\s+to\s+(?:continue|keep going)\b/i
]

const RECOVERY_HINT_PATTERNS: RegExp[] = [
  /\bresets?\s+(?:at|in|on)\b/i,
  /\bresets?\s*:/i,
  /\btry\s+again\s+(?:at|in|after|later)\b/i,
  /\bavailable\s+again\b/i,
  /\bretry\s+after\b/i
]

// Per-agent wordings that the generic table would miss or judge ambiguous.
const AGENT_LIMIT_PATTERNS: Record<string, RegExp[]> = {
  claude: [/\bclaude\b[^\n]{0,40}\busage limit reached\b/i],
  openclaude: [/\bclaude\b[^\n]{0,40}\busage limit reached\b/i],
  codex: [/\byou'?ve hit your (?:\d+h |weekly )?usage limit\b/i, /\b\d+h limit reached\b/i],
  gemini: [/\bdaily\b[^\n]{0,40}\bquota\b[^\n]{0,20}\blimit\b/i, /\bresource[_ ]exhausted\b/i],
  cursor: [/\byou'?ve reached your (?:request|usage) limit\b/i]
}

// Why: agents narrate about rate limits all the time ("I'll add rate limit
// handling"). Skip lines that read as code or as an inline quotation so a
// discussion of the concept never schedules a resume.
const CODE_SHAPED = /[`{};]|=>|\bconst\b|\bfunction\b|\bimport\b/

// Why: the ambiguous phrasings ("rate limited", "retry after") are exactly the
// words an agent uses when it narrates writing retry code. A provider banner is
// never written in the agent's own first person, so that lead is disqualifying.
const AGENT_NARRATION_LEAD = /^(?:i|i'?(?:ll|m|ve)|let(?:'s| me)|we|we'?(?:ll|ve))\b/i

function isDefinitiveLimitLine(line: string): boolean {
  return DEFINITIVE_LIMIT_PATTERNS.some((pattern) => pattern.test(line))
}

function isAmbiguousLimitLine(line: string): boolean {
  return AMBIGUOUS_LIMIT_PATTERNS.some((pattern) => pattern.test(line))
}

function hasRecoveryHint(lines: string[]): boolean {
  return lines.some((line) => RECOVERY_HINT_PATTERNS.some((pattern) => pattern.test(line)))
}

function agentPatternsFor(agent: AgentType): RegExp[] {
  return AGENT_LIMIT_PATTERNS[agent] ?? []
}

/**
 * Decide whether `lines[index]` opens a limit banner, given the following
 * context lines. Definitive phrasings stand alone; ambiguous ones need a reset
 * or retry hint nearby.
 */
export function isRateLimitBannerLine(lines: string[], index: number, agent: AgentType): boolean {
  const line = lines[index]
  if (!line || CODE_SHAPED.test(line)) {
    return false
  }
  if (agentPatternsFor(agent).some((pattern) => pattern.test(line))) {
    return true
  }
  if (isDefinitiveLimitLine(line)) {
    return true
  }
  if (!isAmbiguousLimitLine(line) || AGENT_NARRATION_LEAD.test(line.trimStart())) {
    return false
  }
  return hasRecoveryHint(lines.slice(index, index + RATE_LIMIT_BANNER_CONTEXT_LINES))
}

/**
 * Find the first limit banner in `lines` and return it with its trailing
 * context (the reset wording usually sits a line or two below the headline).
 * Returns null when nothing in the window reads as a limit.
 */
export function detectRateLimitBanner(lines: string[], agent: AgentType): string[] | null {
  for (let index = 0; index < lines.length; index++) {
    if (!isRateLimitBannerLine(lines, index, agent)) {
      continue
    }
    return lines
      .slice(index, index + RATE_LIMIT_BANNER_CONTEXT_LINES)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }
  return null
}

// Claude's API-error form carries the exact reset as epoch seconds after a pipe:
// "Claude AI usage limit reached|1761200000". Nothing else to parse when present.
const INLINE_EPOCH_RE = /\blimit reached\s*\|\s*(\d{9,13})\b/i

/** Epoch ms encoded directly in the banner, or null when it carries no stamp. */
export function extractInlineResetEpochMs(bannerLines: string[]): number | null {
  for (const line of bannerLines) {
    const match = INLINE_EPOCH_RE.exec(line)
    if (!match) {
      continue
    }
    const raw = Number(match[1])
    if (!Number.isFinite(raw)) {
      continue
    }
    // Ten digits or fewer is seconds; longer is already milliseconds.
    const epochMs = match[1].length <= 10 ? raw * 1000 : raw
    if (epochMs > Date.now()) {
      return epochMs
    }
  }
  return null
}
